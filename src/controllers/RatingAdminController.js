import Feedback from "../models/FeedbackModel.js";
import Rating from "../models/Rating.js";
import Customer from "../models/Customer.js";
export const showRatingDashboard = async (req, res) => {
  try {
    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    const { month, day, year, customerType } = req.query;
    const filter = {};

    if (year || month || day) {
      let startDate = new Date(year || now.getFullYear(), (month ? month - 1 : 0), day || 1);
      let endYear = year || now.getFullYear();
      let endMonth = month ? month - 1 : 11;
      let endDay = day || new Date(endYear, endMonth + 1, 0).getDate();
      let endDate = new Date(endYear, endMonth, endDay, 23, 59, 59, 999);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    if (customerType && ["Dine-in", "Take-out", "Delivery"].includes(customerType)) {
      filter.customerType = customerType;
    }

    const feedbacks = await Feedback.find(filter).populate("ratingID").lean();

    const overallRatings = feedbacks
      .map(fb => fb.ratingID?.overallExperience)
      .filter(r => typeof r === "number" && r > 0);

    const totalRatings = overallRatings.length;
    const overallAverage = totalRatings
      ? overallRatings.reduce((a, b) => a + b, 0) / totalRatings
      : 0;

    const highRatingsCount = overallRatings.filter(r => r >= 4).length;
    const highRatingPercent = totalRatings
      ? ((highRatingsCount / totalRatings) * 100).toFixed(2)
      : "0.00";

    const thisWeekCount = feedbacks.filter(fb => new Date(fb.createdAt) >= oneWeekAgo).length;

    const categories = [
      { key: "overallExperience", label: "Overall Experience" },
      { key: "foodQuality", label: "Food Quality" },
      { key: "service", label: "Service" },
      { key: "ambiance", label: "Ambiance" },
      { key: "valueForMoney", label: "Value For Money" },
      { key: "staffAttitude", label: "Staff Attitude" },
      { key: "bartenderAttitude", label: "Bartender Attitude" }
    ];

    const categoryRatings = {};
    categories.forEach(cat => {
      const catRatings = feedbacks.map(fb => fb.ratingID?.[cat.key]).filter(r => typeof r === "number");
      const avg = catRatings.reduce((a, b) => a + b, 0) / catRatings.length || 0;
      categoryRatings[cat.label] = { average: avg, count: catRatings.length, trend: avg };
    });

    const peakHours = {};
    for (let h = 0; h < 24; h++) peakHours[h] = { count: 0, totalRating: 0, avgRating: 0 };

    feedbacks.forEach(fb => {
      const hour = new Date(fb.createdAt).getHours();
      const rating = fb.ratingID?.overallExperience;
      if (typeof rating === "number") {
        peakHours[hour].count += 1;
        peakHours[hour].totalRating += rating;
      }
    });

    Object.keys(peakHours).forEach(hour => {
      const data = peakHours[hour];
      data.avgRating = data.count ? (data.totalRating / data.count).toFixed(2) : 0;
      delete data.totalRating;
    });

    const months = [];
    const trendsDatasets = categories.map(cat => ({ label: cat.label, data: [] }));

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(now.getMonth() - i);
      months.push(d.toLocaleString("default", { month: "short" }));

      categories.forEach((cat, idx) => {
        const monthRatings = feedbacks
          .filter(fb =>
            new Date(fb.createdAt).getMonth() === d.getMonth() &&
            new Date(fb.createdAt).getFullYear() === d.getFullYear()
          )
          .map(fb => fb.ratingID?.[cat.key])
          .filter(r => typeof r === "number");
        const avg = monthRatings.reduce((a, b) => a + b, 0) / monthRatings.length || 0;
        trendsDatasets[idx].data.push(parseFloat(avg.toFixed(1)));
      });
    }

    const ratingDistribution = {};
    [5, 4, 3, 2, 1].forEach(star => {
      const count = overallRatings.filter(r => r === star).length;
      ratingDistribution[star] = {
        count,
        percentage: totalRatings ? ((count / totalRatings) * 100).toFixed(1) : 0
      };
    });

const categoryPerformance = {};

categories.forEach(cat => {
  const catRatings = feedbacks
    .map(fb => fb.ratingID?.[cat.key])
    .filter(r => typeof r === "number" && r > 0);

  if (catRatings.length === 0) {
    categoryPerformance[cat.label] = {
      average: 0,
      percentage: 0,
      count: 0,
      performance: "No Data",
      min: 0,
      max: 0
    };
    return;
  }

  const sum = catRatings.reduce((a, b) => a + b, 0);
  const avg = sum / catRatings.length;
  const percentage = avg * 20;
  const min = Math.min(...catRatings);
  const max = Math.max(...catRatings);

  let performance;
  if (avg >= 4.5) performance = "Excellent";
  else if (avg >= 3.5) performance = "Good";
  else if (avg >= 2.5) performance = "Fair";
  else performance = "Poor";

  categoryPerformance[cat.label] = {
    average: avg.toFixed(2),
    percentage: percentage.toFixed(1),
    count: catRatings.length,
    performance,
    min,
    max
  };
});


    const recentFiveStarReviews = feedbacks
      .filter(fb => fb.ratingID?.overallExperience === 5)
      .slice(-5)
      .map(fb => ({
        customerName: fb.customerName,
        message: fb.ratingID?.overallExperienceReason || fb.message || "-",
        category: "Overall",
        timeAgo: fb.createdAt
      }));

    const lowRatings = feedbacks
      .filter(fb => fb.ratingID?.overallExperience <= 2)
      .slice(-5)
      .map(fb => ({
        customerName: fb.customerName,
        message: fb.ratingID?.overallExperienceReason || fb.message || "-",
        category: "Overall",
        rating: fb.ratingID?.overallExperience,
        timeAgo: fb.createdAt
      }));

    res.render("analytics/ratingAdmin", {
      stats: {
        overallRating: overallAverage,
        totalRatings,
        fourToFiveStarPercentage: highRatingPercent,
        thisWeek: thisWeekCount
      },
      overallRatings,
      categoryRatings,
      trends: { labels: months, datasets: trendsDatasets },
      ratingDistribution,
      categoryPerformance,
      recentFiveStarReviews,
      lowRatings,
      peakHours,
      query: req.query || {}
    });

  } catch (err) {
    console.error("Error in showRatingDashboard:", err);
    res.status(500).send("Server Error");
  }
};
