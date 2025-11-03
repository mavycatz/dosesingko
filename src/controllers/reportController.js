import Feedback from '../models/FeedbackModel.js';
import Customer from '../models/Customer.js';
import * as math from 'mathjs';

const ratingLabels = {
  foodQuality: "Food Quality",
  ambiance: "Ambiance",
  service: "Service",
  valueForMoney: "Value for Money",
  staffAttitude: "Staff Attitude",
  bartenderAttitude: "Bartender Attitude"
};

function calculateRegression(feedbacks) {
  if (!feedbacks.length) {
    return { labels: [], values: [], projected: [], avgRatings: {}, suggestions: [] };
  }

  const keys = ["foodQuality","ambiance","service","valueForMoney","staffAttitude","bartenderAttitude"];
  const n = feedbacks.length;


  const avgRatings = {};
  keys.forEach(k => {
    avgRatings[k] = feedbacks.reduce((a,f)=>a+(f.ratingID?.[k] ?? 0),0)/n;
  });


  const labels = keys.map(k => ratingLabels[k] || k);
  const values = keys.map(k => avgRatings[k]);


  const X = values.map((v,i)=>[1,i]); 
  const Y = values.map(v=>[v]);

  let projected = [];
  try {
    const Xt = math.transpose(X);
    const XtX = math.multiply(Xt, X);
    const XtY = math.multiply(Xt, Y);
    const B = math.multiply(math.inv(XtX), XtY);

    const intercept = B[0][0];
    const slope = B[1][0];

    projected = values.map((_,i)=> intercept + slope*i);
  } catch {
    projected = values;
  }

  let suggestions = [];
  keys.forEach(k=>{
    if(avgRatings[k] < 3.5){
      suggestions.push(`${ratingLabels[k]} needs improvement (avg: ${avgRatings[k].toFixed(2)})`);
    }
  });
  if (!suggestions.length) suggestions.push("All ratings are satisfactory. Keep it up!");

  return { labels, values, projected, avgRatings, suggestions };
}

export const renderDashboardPage = async (req, res) => {
  try {
    const { year, month, day } = req.query;
    const now = new Date();

    const currentYear = year ? parseInt(year) : now.getFullYear();
    const currentMonth = month ? parseInt(month) - 1 : now.getMonth();
    const currentDay = day ? parseInt(day) : now.getDate();

    let start = new Date(currentYear, currentMonth, day ? currentDay : 1, 0, 0, 0);
    let end;
    if (day) {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (month) {
      end = new Date(currentYear, currentMonth + 1, 1);
    } else {
      end = new Date(currentYear + 1, 0, 1);
    }

    const feedbacks = await Feedback.find({ createdAt: { $gte: start, $lt: end } })
      .populate("ratingID")
      .lean();

    const totalFeedback = feedbacks.length;

    const feedbacksWithRatings = feedbacks.filter(f => f.ratingID);
    const avgRating =
      feedbacksWithRatings.length > 0
        ? feedbacksWithRatings.reduce((sum, f) => sum + (f.ratingID.overallExperience || 0), 0) /
          feedbacksWithRatings.length
        : 0;

    const allCustomers = await Customer.find().lean();
    const activeCustomers = allCustomers.length; 

    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    const periodLength = end - start;
    prevStart.setTime(start.getTime() - periodLength);

    const prevFeedbacks = await Feedback.find({ createdAt: { $gte: prevStart, $lt: prevEnd } })
      .populate("ratingID")
      .lean();

    const prevFeedbacksWithRatings = prevFeedbacks.filter(f => f.ratingID);
    const prevTotalFeedback = prevFeedbacks.length;
    const prevAvgRating =
      prevFeedbacksWithRatings.length > 0
        ? prevFeedbacksWithRatings.reduce((sum, f) => sum + (f.ratingID.overallExperience || 0), 0) /
          prevFeedbacksWithRatings.length
        : 0;

    const totalFeedbackChange = totalFeedback - prevTotalFeedback;
    const avgRatingChange = avgRating - prevAvgRating;
    const customerChange = 0; 

    const last7Days = new Date();
    last7Days.setDate(now.getDate() - 7);
    const recentSubmissions = await Feedback.countDocuments({ createdAt: { $gte: last7Days } });

    const previous7Days = new Date();
    previous7Days.setDate(now.getDate() - 14);
    const previousSubmissions = await Feedback.countDocuments({
      createdAt: { $gte: previous7Days, $lt: last7Days },
    });

    const submissionChange = recentSubmissions - previousSubmissions;

    const ratingTotals = {
      foodQuality: 0,
      ambiance: 0,
      service: 0,
      valueForMoney: 0,
      staffAttitude: 0,
      bartenderAttitude: 0,
    };
    const ratingCounts = { ...ratingTotals };

    feedbacksWithRatings.forEach(f => {
      const r = f.ratingID;
      for (const key in ratingTotals) {
        if (r[key] != null) {
          ratingTotals[key] += r[key];
          ratingCounts[key]++;
        }
      }
    });

    const avgRatings = {};
    for (const key in ratingTotals) {
      avgRatings[key] = ratingCounts[key] ? ratingTotals[key] / ratingCounts[key] : 0;
    }

    res.render("analytics/dashboard", {
      user: req.session.user,
      feedbackData: {
        totalFeedback,
        avgRating,
        activeCustomers,
        recentSubmissions,
        totalFeedbackChange,
        avgRatingChange,
        customerChange,
        submissionChange,
        avgRatings,
      },
      activeItem: "Dashboard",
    });
  } catch (err) {
    console.error("renderDashboardPage failed:", err);
    res.status(500).send("Server error");
  }
};

export const getRatingsData = async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = req.query.month ? parseInt(req.query.month) : null;
    const day = req.query.day ? parseInt(req.query.day) : null;
    const hour = req.query.hour ? parseInt(req.query.hour) : null;

    let start, end;

    if (!year) return res.status(400).json({ error: "Year is required" });

    if (hour != null && day != null && month != null) {
      start = new Date(year, month - 1, day, hour, 0, 0);
      end = new Date(start);
      end.setHours(end.getHours() + 1);
    } else if (day != null && month != null) {
      start = new Date(year, month - 1, day, 0, 0, 0);
      end = new Date(year, month - 1, day + 1, 0, 0, 0);
    } else if (month != null) {
      start = new Date(year, month - 1, 1, 0, 0, 0);
      end = new Date(year, month, 1, 0, 0, 0);
    } else {
      start = new Date(year, 0, 1, 0, 0, 0);
      end = new Date(year + 1, 0, 1, 0, 0, 0);
    }

    const feedbacks = await Feedback.find({
      createdAt: { $gte: start, $lt: end }
    }).populate("ratingID");

    const validFeedbacks = feedbacks.filter(f => f.ratingID);

    const ratingTotals = {
      foodQuality: 0,
      ambiance: 0,
      service: 0,
      valueForMoney: 0,
      staffAttitude: 0,
      bartenderAttitude: 0
    };
    const ratingCounts = { ...ratingTotals };

    validFeedbacks.forEach(f => {
      const r = f.ratingID;
      for (const key in ratingTotals) {
        if (r[key] != null) {
          ratingTotals[key] += r[key];
          ratingCounts[key]++;
        }
      }
    });

    const avgRatings = {};
    for (const key in ratingTotals) {
      avgRatings[key] = ratingCounts[key] ? +(ratingTotals[key] / ratingCounts[key]).toFixed(2) : 0;
    }

    const ratingDistribution = [1, 2, 3, 4, 5].map(star =>
      validFeedbacks.filter(f => f.ratingID.overallExperience === star).length
    );

    res.json({ avgRatings, ratingDistribution });
  } catch (err) {
    console.error("getRatingsData failed:", err);
    res.status(500).json({ error: "Server error" });
  }
};


export const getFilteredFeedback = async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = req.query.month ? parseInt(req.query.month) : null;
    const day = req.query.day ? parseInt(req.query.day) : null;
    const hour = req.query.hour ? parseInt(req.query.hour) : null;

    if (!year) return res.status(400).json({ error: "Year is required" });

    let start = new Date(year, month ? month - 1 : 0, day || 1, hour || 0, 0, 0);
    let end;

    if (hour != null) {
      end = new Date(start);
      end.setHours(end.getHours() + 1);
    } else if (day != null) {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (month != null) {
      end = new Date(year, month, 1);
    } else {
      end = new Date(year + 1, 0, 1);
    }

    const filter = { createdAt: { $gte: start, $lt: end } };

    const feedbacks = await Feedback.find(filter).populate("ratingID").lean();
    const validFeedbacks = feedbacks.filter(f => f.ratingID && f.orNumber);

    const totalFeedback = validFeedbacks.length;

    const ratingTotals = { foodQuality: 0, ambiance: 0, service: 0, valueForMoney: 0, staffAttitude: 0, bartenderAttitude: 0 };
    const ratingCounts = { ...ratingTotals };

    let sumAllRatings = 0;
    let countAllRatings = 0;

    validFeedbacks.forEach(f => {
      const r = f.ratingID;
      for (const key in ratingTotals) {
        if (r[key] != null) {
          ratingTotals[key] += r[key];
          ratingCounts[key]++;
          sumAllRatings += r[key];
          countAllRatings++;
        }
      }
    });

    const avgRatings = {};
    for (const key in ratingTotals) {
      avgRatings[key] = ratingCounts[key] ? ratingTotals[key] / ratingCounts[key] : 0;
    }

    const avgRating = countAllRatings ? sumAllRatings / countAllRatings : 0;

    const submittedORsSet = new Set(validFeedbacks.map(f => f.orNumber));
    const activeCustomers = submittedORsSet.size;

    const regressionData = calculateRegression(validFeedbacks);

    res.json({
      totalFeedback,
      avgRatings,
      avgRating,
      activeCustomers,
      regressionData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};
export const addORNumber = async (req, res) => {
  try {

    if (req.session.userRole !== "cashier") {
      return res.status(403).json({ error: "Access denied. Only cashiers can add OR Numbers." });
    }

    const { orNumber } = req.body;
    if (!orNumber) return res.status(400).json({ error: 'OR Number is required' });

    const existing = await Customer.findOne({ orNumber });
    if (existing) return res.status(400).json({ error: 'OR Number already exists' });

    const customer = new Customer({ orNumber });
    await customer.save();

    res.status(201).json({ message: 'OR Number added', customer });
  } catch (err) {
    console.error('addORNumber failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};



export const generateReport = async (req, res) => {
  try {
    const feedbacks = await Feedback.find().populate('ratingID');
    const validFeedbacks = feedbacks.filter(f => f.ratingID);

    const totalFeedback = validFeedbacks.length;
    const avgRating = totalFeedback
      ? validFeedbacks.reduce((sum, f) => sum + (f.ratingID.overallExperience || 0), 0) / totalFeedback
      : 0;

    res.json({ totalFeedback, avgRating, message: 'Report generated successfully' });
  } catch (err) {
    console.error('generateReport failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
export const getRecentFeedback = async (req, res) => {
  try {
    const recentFeedbacks = await Feedback.find()
      .sort({ createdAt: -1 })
      .limit(25) 
      .populate('ratingID')
      .lean();

    if (!recentFeedbacks || recentFeedbacks.length === 0) {
      return res.json({ profiles: [] });
    }

    const profiles = recentFeedbacks.map(fb => ({
      name: fb.customerName || 'Anonymous',
      email: fb.customerEmail || 'N/A',
      message: fb.message || 'No message provided',
      category: fb.customerType || 'General',
      createdAt: fb.createdAt,
      ratings: fb.ratingID
        ? {
            overallExperience: fb.ratingID.overallExperience,
            overallExperienceReason: fb.ratingID.overallExperienceReason,
            foodQuality: fb.ratingID.foodQuality,
            foodQualityReason: fb.ratingID.foodQualityReason,
            ambiance: fb.ratingID.ambiance,
            ambianceReason: fb.ratingID.ambianceReason,
            service: fb.ratingID.service,
            serviceReason: fb.ratingID.serviceReason,
            valueForMoney: fb.ratingID.valueForMoney,
            valueForMoneyReason: fb.ratingID.valueForMoneyReason,
            staffAttitude: fb.ratingID.staffAttitude,
            staffAttitudeReason: fb.ratingID.staffAttitudeReason,
            bartenderAttitude: fb.ratingID.bartenderAttitude,
            bartenderAttitudeReason: fb.ratingID.bartenderAttitudeReason,
            recommendToOthers: fb.ratingID.recommendToOthers,
            recommendToOthersReason: fb.ratingID.recommendToOthersReason
          }
        : null
    }));

    res.json({ profiles });
  } catch (err) {
    console.error('getRecentFeedback failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
