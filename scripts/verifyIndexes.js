import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import ShortUrl from "../src/models/url.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function verifyIndexes() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL missing");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  console.log("Connected to MongoDB.");

  // Sync schema indexes with DB
  console.log("\n[1] Syncing indexes...");
  await ShortUrl.syncIndexes();
  console.log("Indexes synchronized successfully.");

  // List all indexes
  console.log("\n[2] Current Indexes on 'shorturls' collection:");
  const indexes = await ShortUrl.collection.getIndexes();
  console.log(JSON.stringify(indexes, null, 2));

  // Run explain() on lookup query
  console.log("\n[3] Query Execution Plan (explain executionStats) for findOne({ short: 'testCode' }):");
  const explanation = await ShortUrl.find({ short: "testCode" }).explain("executionStats");
  
  const queryPlanner = explanation.queryPlanner || explanation[0].queryPlanner;
  const winningPlan = queryPlanner.winningPlan;
  
  console.log("Winning Plan Stage:", winningPlan.stage || winningPlan.inputStage.stage);
  console.log("Full Query Explanation summary:");
  console.log(`- Index Used: ${winningPlan.inputStage?.indexName || winningPlan.indexName || "COLLSCAN (No index!)"}`);
  console.log(`- Execution Stages: ${JSON.stringify(winningPlan, null, 2)}`);

  await mongoose.disconnect();
  console.log("\n[Database] Disconnected cleanly.");
}

verifyIndexes().catch((err) => {
  console.error("Error verifying indexes:", err);
  process.exit(1);
});
