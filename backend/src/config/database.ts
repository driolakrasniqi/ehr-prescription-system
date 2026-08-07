import mysql, { type RowDataPacket } from "mysql2/promise";
import { env } from "./env.js";

export const databasePool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,

  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60_000,
  queueLimit: 0,

  charset: "utf8mb4",
  timezone: "Z",
  decimalNumbers: true
});

interface DatabaseHealthRow extends RowDataPacket {
  databaseName: string;
  databaseVersion: string;
  utcTime: Date;
}

export async function checkDatabaseConnection(): Promise<DatabaseHealthRow> {
  const [rows] = await databasePool.query<DatabaseHealthRow[]>(`
    SELECT
      DATABASE() AS databaseName,
      VERSION() AS databaseVersion,
      UTC_TIMESTAMP(3) AS utcTime
  `);

  const health = rows[0];

  if (!health) {
    throw new Error("The database health query returned no result.");
  }

  return health;
}