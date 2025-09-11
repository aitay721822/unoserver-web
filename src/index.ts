import { createApp } from './app.js'

const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000

const fastify = createApp({
	basePath: process.env.BASE_PATH,
	requestIdHeader: process.env.REQUEST_ID_HEADER,
	requestIdLogLabel: process.env.REQUEST_ID_LOG_LABEL,
})

const ALL_AVAILABLE_IPV4_INTERFACES = '0.0.0.0'

await fastify.listen({ port: PORT, host: ALL_AVAILABLE_IPV4_INTERFACES })

fastify.log.info(`Mode: ${process.env.NODE_ENV ?? 'unset'}`)

// 優雅關閉處理
const shutdown = async (signal: string) => {
	fastify.log.info(`Received ${signal}, shutting down gracefully...`)
	try {
		await fastify.close()
		process.exit(0)
	} catch (error) {
		fastify.log.error(`Error during shutdown: ${error}`)
		process.exit(1)
	}
}

process.on('SIGINT', () => {
	shutdown('SIGINT').catch(error => {
		console.error('Failed to shutdown gracefully:', error)
		process.exit(1)
	})
})
process.on('SIGTERM', () => {
	shutdown('SIGTERM').catch(error => {
		console.error('Failed to shutdown gracefully:', error)
		process.exit(1)
	})
})
