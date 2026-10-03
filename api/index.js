// Vercel serverless entry point: every non-static request is routed here
// (see vercel.json) and handled by the Express app.
import app from '../server/app.js';

export default app;
