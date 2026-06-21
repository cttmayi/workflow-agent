export async function startDashboard(port) {
  try {
    const { createServer } = await import('../../../dashboard/server/index.js')
    const server = await createServer({ port: parseInt(port) })
    console.log(`Dashboard running at http://localhost:${port}`)
    return server
  } catch (err) {
    console.error('Failed to start dashboard:', err.message)
    process.exit(1)
  }
}
