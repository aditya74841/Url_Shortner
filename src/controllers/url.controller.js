import UrlService from "../services/url.service.js";
import catchAsync from "../utils/catchAsync.js";

export const createUrl = catchAsync(async (req, res) => {
  const { fullUrl } = req.body;
  const { urlDoc, created } = await UrlService.createShortUrl(fullUrl);

  const statusCode = created ? 201 : 200;
  res.status(statusCode).json({
    status: "success",
    data: {
      id: urlDoc._id,
      full: urlDoc.full,
      short: urlDoc.short,
      clicks: urlDoc.clicks,
      shortUrl: `${req.protocol}://${req.get("host")}/${urlDoc.short}`,
      createdAt: urlDoc.createdAt,
    },
  });
});

export const getAllUrls = catchAsync(async (req, res) => {
  const urls = await UrlService.getAllUrls();
  res.status(200).json({
    status: "success",
    results: urls.length,
    data: { urls },
  });
});

export const getUrlStats = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  const urlDoc = await UrlService.getByShortCode(shortUrl);

  res.status(200).json({
    status: "success",
    data: {
      full: urlDoc.full,
      short: urlDoc.short,
      clicks: urlDoc.clicks,
      createdAt: urlDoc.createdAt,
    },
  });
});

export const registerClickApi = catchAsync(async (req, res) => {
  const { shortUrl } = req.params;
  const urlDoc = await UrlService.getByShortCode(shortUrl);
  const updatedDoc = await UrlService.recordClick(urlDoc);

  res.status(200).json({
    status: "success",
    clicks: updatedDoc.clicks,
  });
});
