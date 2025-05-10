const express = require("express");
const mongoose = require("mongoose");
const ShortUrl = require("./models/shortUrl");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

mongoose.set("strictQuery", false);
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public"))); // For future use if needed
app.use(express.json()); // Needed for JSON APIs

// Homepage with all short URLs
app.get("/", async (req, res) => {
  const shortUrls = await ShortUrl.find();
  res.render("index", { shortUrls, request: req });
});

// Handle form submission for new short URLs
app.post("/shortUrls", async (req, res) => {
  const fullUrl = req.body.fullUrl;

  // Check for existing URL
  const existing = await ShortUrl.findOne({ full: fullUrl });
  if (existing) {
    return res.status(400).send(`<script>alert("URL already exists!"); window.location.href = "/"</script>`);
  }

  await ShortUrl.create({ full: fullUrl });
  res.redirect("/");
});

// Handle redirection
app.get("/:shortUrl", async (req, res) => {
  const shortUrl = await ShortUrl.findOne({ short: req.params.shortUrl });
  if (!shortUrl) return res.sendStatus(404);

  shortUrl.clicks++;
  await shortUrl.save();

  res.redirect(shortUrl.full);
});

// AJAX endpoint to update clicks without redirect
app.post("/api/click/:shortUrl", async (req, res) => {
  const shortUrl = await ShortUrl.findOne({ short: req.params.shortUrl });
  if (!shortUrl) return res.status(404).json({ error: "Short URL not found" });

  shortUrl.clicks++;
  await shortUrl.save();

  res.json({ clicks: shortUrl.clicks });
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Listening on port", process.env.PORT || 5000);
});
