import UrlService from "../services/url.service.js";
import catchAsync from "../utils/catchAsync.js";

export const renderHome = catchAsync(async (req, res) => {
  const shortUrls = await UrlService.getAllUrls();
  res.render("index", { shortUrls, request: req });
});

export const createUrlForm = catchAsync(async (req, res) => {
  const { fullUrl } = req.body;
  await UrlService.createShortUrl(fullUrl);
  res.redirect("/");
});

export const redirectToFullUrl = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  const urlDoc = await UrlService.getByShortCode(shortUrl);
  await UrlService.recordClick(urlDoc);

  res.redirect(urlDoc.full);
});
