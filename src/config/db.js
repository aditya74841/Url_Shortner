import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("CRITICAL ERROR: MONGO_URL environment variable is not defined.");
    process.exit(1);
  }

  mongoose.set("strictQuery", false);

  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || "10", 10),
    minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || "2", 10),
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4
  };

  try {
    const conn = await mongoose.connect(mongoUrl, options);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
    console.log(`[Database] Connection Pool configured (min: ${options.minPoolSize}, max: ${options.maxPoolSize})`);
  } catch (error) {
    console.error(`[Database] Connection Error: ${error.message}`);
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("[Database] MongoDB disconnected!");
  });

  mongoose.connection.on("error", (err) => {
    console.error(`[Database] MongoDB Error: ${err.message}`);
  });
};

export default connectDB;
