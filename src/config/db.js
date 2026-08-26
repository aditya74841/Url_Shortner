import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("CRITICAL ERROR: MONGO_URL environment variable is not defined.");
    process.exit(1);
  }

  mongoose.set("strictQuery", false);

  try {
    const conn = await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
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
