import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { execa } from 'execa'

const mockState = vi.hoisted(() => ({
	unoconvertCalls: 0,
	unoconvertFailureBudget: 0,
}))

vi.mock('execa', () => {
	const execa = vi.fn(async (command: string) => {
		if (command === 'unoserver') {
			const processPromise = Promise.resolve(undefined) as Promise<void> & {
				kill: ReturnType<typeof vi.fn>
				on: ReturnType<typeof vi.fn>
			}
			processPromise.kill = vi.fn()
			processPromise.on = vi.fn().mockReturnValue(processPromise)
			return processPromise
		}

		if (command === 'unoconvert') {
			mockState.unoconvertCalls++
			if (mockState.unoconvertFailureBudget > 0) {
				mockState.unoconvertFailureBudget--
				throw new Error('unoconvert failed')
			}

			return undefined
		}

		throw new Error(`Unexpected command: ${command}`)
	})

	return { execa }
})

async function loadUnoserverModule() {
	vi.resetModules()
	return import('../utils/unoserver.js')
}

async function createTempFile(filename: string): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), 'unoserver-unit-'))
	const filePath = path.join(dir, filename)
	await writeFile(filePath, 'test')
	return filePath
}

beforeEach(() => {
	mockState.unoconvertCalls = 0
	mockState.unoconvertFailureBudget = 0
	vi.clearAllMocks()
	delete process.env.MAX_WORKERS
	delete process.env.MAX_SKIP_RESTARTS
	delete process.env.CONVERSION_RETRIES
})

describe('UnoserverInstance', () => {
	test('restart resets isRestarting in finally and keeps skip count on failure', async () => {
		const { Unoserver, unoserver } = await loadUnoserverModule()
		await unoserver.stopServer()

		const service = new Unoserver({ maxWorkers: 1 })
		const instance = service.instances[0]!

		instance.skipRestartCount = 2
		;(instance as unknown as { stopServer: () => Promise<void> }).stopServer = vi
			.fn()
			.mockResolvedValue(undefined)
		;(instance as unknown as { runServer: () => Promise<void> }).runServer = vi
			.fn()
			.mockRejectedValue(new Error('restart failed'))

		await expect(instance.restart()).rejects.toThrow('restart failed')
		expect(instance.isRestarting).toBe(false)
		expect(instance.skipRestartCount).toBe(2)

		await service.stopServer()
	})

	test('convert retries after first unoconvert failure and triggers restart', async () => {
		process.env.CONVERSION_RETRIES = '3'

		const { Unoserver, unoserver } = await loadUnoserverModule()
		await unoserver.stopServer()

		const service = new Unoserver({ maxWorkers: 1 })
		const instance = service.instances[0]!
		const restartSpy = vi.spyOn(instance, 'restart').mockResolvedValue(undefined)

		const sourcePath = await createTempFile('source.txt')
		const targetPath = path.join(path.dirname(sourcePath), 'target.pdf')

		mockState.unoconvertFailureBudget = 1
		await instance.convert(sourcePath, targetPath)

		expect(mockState.unoconvertCalls).toBe(2)
		expect(restartSpy).toHaveBeenCalledTimes(1)

		await service.stopServer()
	})

	test('convert aborts immediately when signal is already aborted', async () => {
		const { Unoserver, unoserver } = await loadUnoserverModule()
		await unoserver.stopServer()

		const service = new Unoserver({ maxWorkers: 1 })
		const instance = service.instances[0]!

		const sourcePath = await createTempFile('source.txt')
		const targetPath = path.join(path.dirname(sourcePath), 'target.pdf')
		const abortController = new AbortController()
		abortController.abort()

		await expect(
			instance.convert(sourcePath, targetPath, undefined, abortController.signal),
		).rejects.toThrow(/aborted/i)
		expect(mockState.unoconvertCalls).toBe(0)

		await service.stopServer()
	})

	test('stopServer falls back to SIGKILL when graceful shutdown fails', async () => {
		const { Unoserver, unoserver } = await loadUnoserverModule()
		await unoserver.stopServer()

		const service = new Unoserver({ maxWorkers: 1 })
		const instance = service.instances[0]!
		await (
			service as unknown as { warmupInstances: () => Promise<void> }
		).warmupInstances()

		const killSpy = vi.fn()
		const failingProcess = Promise.reject(
			new Error('process failed'),
		) as Promise<void> & {
			kill: (signal: string) => void
			on: ReturnType<typeof vi.fn>
		}
		failingProcess.kill = killSpy
		failingProcess.on = vi.fn().mockReturnValue(failingProcess)
		instance.unoserver = failingProcess as never

		await instance.stopServer()

		expect(killSpy).toHaveBeenNthCalledWith(1, 'SIGTERM')
		expect(killSpy).toHaveBeenNthCalledWith(2, 'SIGKILL')
		expect(instance.unoserver).toBeNull()

		await service.stopServer()
	})

	test('invalid CONVERSION_RETRIES falls back to default retries', async () => {
		vi.useFakeTimers()
		try {
			process.env.CONVERSION_RETRIES = '-1'

			const { Unoserver, unoserver } = await loadUnoserverModule()
			await unoserver.stopServer()

			const service = new Unoserver({ maxWorkers: 1 })
			const instance = service.instances[0]!

			const sourcePath = await createTempFile('source.txt')
			const targetPath = path.join(path.dirname(sourcePath), 'target.pdf')

			mockState.unoconvertFailureBudget = 10
			const convertExpectation = expect(
				instance.convert(sourcePath, targetPath),
			).rejects.toThrow()
			await vi.advanceTimersByTimeAsync(8000)
			await convertExpectation

			// default retries=3 => total attempts=4
			expect(mockState.unoconvertCalls).toBe(4)

			await service.stopServer()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('Unoserver', () => {
	test('restartInstances skips re-entrant cycle while previous cycle is running', async () => {
		const { Unoserver, unoserver } = await loadUnoserverModule()
		await unoserver.stopServer()

		const service = new Unoserver({ maxWorkers: 1 })
		const instance = service.instances[0]!

		let releaseRestart: (() => void) | undefined
		let restartEnteredResolve: (() => void) | undefined
		const restartEnteredPromise = new Promise<void>(resolve => {
			restartEnteredResolve = resolve
		})

		const restartSpy = vi.spyOn(instance, 'restart').mockImplementation(
			async () =>
				await new Promise<void>(resolve => {
					restartEnteredResolve?.()
					releaseRestart = resolve
				}),
		)

		const firstCyclePromise = service.restartInstances()
		await restartEnteredPromise
		await service.restartInstances()
		releaseRestart?.()
		await firstCyclePromise

		expect(restartSpy).toHaveBeenCalledTimes(1)
		expect(service.restartInProgress).toBe(false)

		await service.stopServer()
	})

	test('busy worker is force restarted after reaching max skip restarts', async () => {
		const { Unoserver, unoserver } = await loadUnoserverModule()
		await unoserver.stopServer()

		const service = new Unoserver({ maxWorkers: 1, maxSkipRestarts: 2 })
		const instance = service.instances[0]!
		instance.inUse = true

		const restartSpy = vi.spyOn(instance, 'restart').mockResolvedValue(undefined)

		await service.restartInstances()
		expect(restartSpy).toHaveBeenCalledTimes(0)
		expect(instance.skipRestartCount).toBe(1)

		await service.restartInstances()
		expect(restartSpy).toHaveBeenCalledTimes(1)

		await service.stopServer()
	})

	test('invalid MAX_WORKERS and MAX_SKIP_RESTARTS fallback to defaults', async () => {
		process.env.MAX_WORKERS = 'abc'
		process.env.MAX_SKIP_RESTARTS = '0'

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const { unoserver } = await loadUnoserverModule()

		expect(unoserver.queue.concurrency).toBe(8)
		expect(unoserver.maxSkipRestarts).toBe(3)
		expect(warnSpy).toHaveBeenCalled()

		await unoserver.stopServer()
	})
})

test('execa mock is active', () => {
	expect(vi.mocked(execa)).toBeDefined()
})
