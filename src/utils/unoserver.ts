import { existsSync } from 'node:fs'
import timersP from 'node:timers/promises'

import { execa, type ResultPromise } from 'execa'
import PQueue from 'p-queue'
import pRetry from 'p-retry'

import { reusePromiseForParallelCalls } from './reusePromiseForParallelCalls.js'

class UnoserverInstance {
	timeout: number
	unoserver: ResultPromise | null
	port: number
	inUse: boolean
	skipRestartCount: number
	isRestarting: boolean

	constructor(port: number, timeout: number = 60000) {
		this.timeout = timeout
		this.unoserver = null
		this.port = port
		this.inUse = false
		this.skipRestartCount = 0
		this.isRestarting = false
		this.runServer = reusePromiseForParallelCalls(this.runServer.bind(this))
	}

	private async runServer() {
		const unoserver = execa('unoserver', ['--port', String(this.port)])
		await Promise.race([unoserver, timersP.setTimeout(5000)])
		void unoserver.on('exit', () => {
			this.unoserver = null
		})
		this.unoserver = unoserver
	}

	stopServer(): void {
		if (this.unoserver) {
			this.unoserver.kill()
		}
	}

	async warmup(): Promise<void> {
		if (!this.unoserver) {
			await this.runServer()
		}
	}

	async restart(): Promise<void> {
		this.isRestarting = true
		this.stopServer()
		await this.runServer()
		this.isRestarting = false
		this.skipRestartCount = 0
	}

	canBeRestarted(): boolean {
		return !this.inUse && !this.isRestarting
	}

	isAvailableForDispatch(): boolean {
		return !this.inUse && !this.isRestarting
	}

	async convert(
		from: string,
		to: string,
		options?: { filter?: string },
		signal?: AbortSignal,
	): Promise<void> {
		return pRetry(
			async () => {
				if (signal?.aborted ?? false) {
					throw new Error('Conversion aborted')
				}

				if (!existsSync(from)) {
					throw new Error('Source file not found')
				}

				if (!this.unoserver) {
					await this.runServer()
				}

				const portCommandArg = ['--port', String(this.port)]
				const filterCommandArg =
					options?.filter !== undefined ? ['--filter', options.filter] : []

				const commandArguments = [...portCommandArg, ...filterCommandArg, from, to]

				await execa('unoconvert', commandArguments, {
					timeout: this.timeout,
					cancelSignal: signal,
				})
			},
			{
				retries:
					process.env.CONVERSION_RETRIES !== undefined
						? Number(process.env.CONVERSION_RETRIES)
						: 3,
				signal,
			},
		)
	}
}

export class Unoserver {
	queue: PQueue
	timeout: number
	instances: UnoserverInstance[]
	startingPort: number
	restartInterval: NodeJS.Timeout | null
	maxSkipRestarts: number

	constructor({
		maxWorkers,
		timeout = 60000,
		startingPort = 12345,
		maxSkipRestarts = 3,
	}: {
		maxWorkers: number
		timeout?: number
		startingPort?: number
		maxSkipRestarts?: number
	}) {
		this.queue = new PQueue({ concurrency: maxWorkers })
		this.timeout = timeout
		this.startingPort = startingPort
		this.maxSkipRestarts = maxSkipRestarts
		this.instances = []

		for (let i = 0; i < maxWorkers; i++) {
			this.instances.push(new UnoserverInstance(startingPort + i, timeout))
		}

		// 預熱第一個實例
		this.warmupInstances().catch(e => {
			console.error('Failed to warmup unoserver instances', e)
		})

		// 設定每1分鐘重啟空閒實例
		this.restartInterval = setInterval(
			() => {
				this.restartInstances().catch(e => {
					console.error('restart unoserver instances failed:', e)
				})
			},
			1 * 60 * 1000,
		)
	}

	private async warmupInstances(): Promise<void> {
		// 預熱前兩個實例以提高初始響應速度
		const instancesToWarmup = Math.min(2, this.instances.length)
		const warmupPromises = this.instances
			.slice(0, instancesToWarmup)
			.map(async instance => instance.warmup().catch(() => {})) // 忽略錯誤，稍後重試

		await Promise.allSettled(warmupPromises)
	}

	private getAvailableInstance(): UnoserverInstance {
		const availableInstance = this.instances.find(instance =>
			instance.isAvailableForDispatch(),
		)
		if (availableInstance) {
			return availableInstance
		}

		if (this.instances.length === 0) {
			throw new Error('No unoserver instances available')
		}

		// 如果沒有可用實例，使用輪詢選擇最少使用的實例
		let leastBusyInstance = this.instances[0]!
		let minUsage = this.queue.pending + (leastBusyInstance.inUse ? 1 : 0)

		for (let i = 1; i < this.instances.length; i++) {
			const instance = this.instances[i]
			if (!instance) {
				continue
			}

			const usage = this.queue.pending + (instance.inUse ? 1 : 0)

			// 優先選擇不在使用中的實例
			if (!instance.inUse && leastBusyInstance.inUse) {
				leastBusyInstance = instance
				minUsage = usage
			} else if (!leastBusyInstance.inUse && instance.inUse) {
				continue
			} else if (usage < minUsage) {
				leastBusyInstance = instance
				minUsage = usage
			}
		}

		return leastBusyInstance
	}

	stopServer(): void {
		// 清除定時重啟任務
		if (this.restartInterval) {
			clearInterval(this.restartInterval)
		}

		for (const instance of this.instances) {
			instance.stopServer()
		}
	}

	async restartInstances(): Promise<void> {
		console.info('Starting restart of unoserver instances...')

		for (const instance of this.instances) {
			if (instance.canBeRestarted()) {
				console.info(`Restarting instance on port ${instance.port}`)
				try {
					await instance.restart()
					console.info(`Instance on port ${instance.port} restarted successfully`)
				} catch (error) {
					console.error(`Failed to restart instance on port ${instance.port}:`, error)
				}
			} else if (instance.inUse) {
				instance.skipRestartCount++
				console.info(
					`Skipping restart for busy instance on port ${instance.port} (skip count: ${instance.skipRestartCount}/${this.maxSkipRestarts})`,
				)

				if (instance.skipRestartCount >= this.maxSkipRestarts) {
					console.info(
						`Force restarting instance on port ${instance.port} after ${this.maxSkipRestarts} skips`,
					)
					try {
						await instance.restart()
						console.info(`Instance on port ${instance.port} force restarted successfully`)
					} catch (error) {
						console.error(
							`Failed to force restart instance on port ${instance.port}:`,
							error,
						)
					}
				}
			}
		}

		console.info('restart cycle completed')
	}

	/**
	 * Converts source file to target file
	 *
	 * @param from source file
	 * @param to target file
	 * @param options conversion options
	 */
	async convert(
		from: string,
		to: string,
		options?: { filter?: string; signal?: AbortSignal },
	): Promise<void> {
		return this.queue.add(
			async () => {
				// Check if aborted before starting conversion
				if (options?.signal?.aborted === true) {
					throw new Error('Conversion aborted')
				}

				const instance = this.getAvailableInstance()
				instance.inUse = true

				try {
					await instance.convert(from, to, { filter: options?.filter }, options?.signal)
				} finally {
					instance.inUse = false
				}
			},
			{ signal: options?.signal },
		)
	}
}

export const unoserver = new Unoserver({
	maxWorkers: process.env.MAX_WORKERS !== undefined ? Number(process.env.MAX_WORKERS) : 8,
	maxSkipRestarts:
		process.env.MAX_SKIP_RESTARTS !== undefined
			? Number(process.env.MAX_SKIP_RESTARTS)
			: 3,
})
