import { createAPI } from './api'

const app = createAPI().listen(8080);

console.log(`Listening on ${app.server!.url}`);

