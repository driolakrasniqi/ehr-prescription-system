import { app } from "./app.js";
import { env } from "./config/env.js";
import {
  checkDatabaseConnection,
  databasePool
} from "./config/database.js";

async function startServer(): Promise<void> {
  try {
    const database = await checkDatabaseConnection();

    console.log(
      `Connected to ${database.databaseName}, MySQL ${database.databaseVersion}`
    );

    const server = app.listen(env.PORT, () => {
      console.log(`API running at http://localhost:${env.PORT}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        await databasePool.end();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("The API could not start:", error);
    await databasePool.end();
    process.exit(1);
  }
}

void startServer();