import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import contentDisposition from 'content-disposition'
import { type FastifyPluginCallback } from 'fastify'
import httpErrors from 'http-errors'
import mime from 'mime-types'

import { convertFile } from './utils/convertFile.js'

export const routes: FastifyPluginCallback = (app, options, next) => {
	app.post<{ Params: { format: string }; Querystring: { filter: string } }>(
		'/convert/:format',
		{
			schema: {
				summary: 'Converts file using LibreOffice',
				consumes: ['multipart/form-data'],
				produces: ['application/octet-stream'],
				params: {
					type: 'object',
					properties: { format: { type: 'string' } },
				},
				querystring: {
					type: 'object',
					properties: { filter: { type: 'string' } },
				},
				body: {
					properties: { file: { type: 'string', format: 'binary' } },
					required: ['file'],
				},
				response: {
					'200': {},
				},
			},
		},
		async (req, res) => {
			const data = await req.file()
			assert(data !== undefined, new httpErrors.BadRequest('Expected file'))

			// Create temporary directory
			const destination = path.join(tmpdir(), `upload-${randomUUID()}`)
			await mkdir(destination, { recursive: true })

			// Save uploaded file
			const filename = data?.filename ?? 'uploaded-file'
			const srcPath = path.join(destination, filename)
			await writeFile(srcPath, await data.toBuffer())

			// Create abort controller to handle client disconnection
			const abortController = new AbortController()

			const cleanup = () => {
				abortController.abort()
				rm(destination, { recursive: true }).catch(() => {
					// ignore
				})
			}

			res.raw.on('close', cleanup)
			res.raw.on('error', cleanup)

			try {
				const { targetPath } = await convertFile(srcPath, req.params.format, {
					filter: req.query.filter,
					signal: abortController.signal,
				})

				const stream = createReadStream(targetPath)

				const mimeType = mime.lookup(req.params.format)

				res.type(mimeType === false ? 'application/octet-stream' : mimeType)
				res.header('Content-Disposition', contentDisposition(path.parse(targetPath).base))

				const { size } = await stat(targetPath)
				res.header('Content-Length', size)

				res.send(stream)

				return res
			} catch (error) {
				if (abortController.signal.aborted) {
					res.code(499).send({ error: 'Client disconnected' })
				} else {
					throw error
				}
			}
		},
	)

	app.get(
		'/queue/status',
		{
			schema: {
				summary: 'Get current queue status',
				response: {
					'200': {
						type: 'object',
						properties: {
							size: { type: 'number', description: 'Number of tasks waiting in queue' },
							pending: { type: 'number', description: 'Number of pending tasks' },
							isPaused: { type: 'boolean', description: 'Whether the queue is paused' },
							concurrency: { type: 'number', description: 'Current concurrency limit' },
							workers: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										id: { type: 'number', description: 'Worker ID' },
										port: { type: 'number', description: 'Port number' },
										inUse: { type: 'boolean', description: 'Whether worker is busy' },
										isRestarting: {
											type: 'boolean',
											description: 'Whether worker is restarting',
										},
										skipRestartCount: {
											type: 'number',
											description: 'Number of restart skips',
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (_, res) => {
			const { unoserver } = await import('./utils/unoserver.js')

			const workers = unoserver.instances.map((instance, index) => ({
				id: index,
				port: instance.port,
				inUse: instance.inUse,
				isRestarting: instance.isRestarting,
				skipRestartCount: instance.skipRestartCount,
			}))

			const queueStatus = {
				size: unoserver.queue.size,
				pending: unoserver.queue.pending,
				isPaused: unoserver.queue.isPaused,
				concurrency: unoserver.queue.concurrency,
				workers,
			}

			res.send(queueStatus)

			return res
		},
	)

	next()
}
