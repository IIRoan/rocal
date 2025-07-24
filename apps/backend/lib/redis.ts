import { createClient, RedisClientType } from "redis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

// Create Redis client configuration for Railway cloud instance
const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 10000,
  },
});

// Create a separate client for pub/sub (Redis requires separate connections)
const redisPubClient: RedisClientType = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 10000,
  },
});

const redisSubClient: RedisClientType = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 10000,
  },
});

// Connection event handlers
redisClient.on("error", (err) => console.error("Redis Client Error:", err));
redisPubClient.on("error", (err) =>
  console.error("Redis Pub Client Error:", err)
);
redisSubClient.on("error", (err) =>
  console.error("Redis Sub Client Error:", err)
);

redisClient.on("connect", () =>
  console.log("✓ Redis client connected to Railway")
);
redisPubClient.on("connect", () =>
  console.log("✓ Redis pub client connected to Railway")
);
redisSubClient.on("connect", () =>
  console.log("✓ Redis sub client connected to Railway")
);

// Initialize connections
let isConnected = false;

export const connectRedis = async () => {
  if (isConnected) return;

  try {
    await Promise.all([
      redisClient.connect(),
      redisPubClient.connect(),
      redisSubClient.connect(),
    ]);
    isConnected = true;
    console.log("✓ All Redis connections established with Railway");
  } catch (error) {
    console.error("Failed to connect to Redis on Railway:", error);
    throw error;
  }
};

export { redisClient, redisPubClient, redisSubClient };
