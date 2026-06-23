import { createHttpServer } from "./http";

const port = Number(process.env.GHOSTSHIFT_PORT ?? 4321);
const server = createHttpServer();

server.listen(port, () => {
  console.log(`GhostShift server listening on http://localhost:${port}`);
});
