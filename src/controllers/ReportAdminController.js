import Feedback from "../models/FeedbackModel.js";
import Customer from "../models/Customer.js";
import Rating from "../models/Rating.js";
import Report from "../models/Report.js";
import ScheduledReport from "../models/ScheduledReport.js";
import { Parser } from "json2csv";
import ejs from "ejs";
import stream from "stream";
import PDFDocument from "pdfkit";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import CustomReport from "../models/CustomReport.js";
import { generateCustomerReportPDF } from "../layout/CustomerReportPDF.js";
import { generateFeedbackReportPDF } from "../layout/FeedbackReportPDF.js";
import { generateMenuReportPDF } from "../layout/MenuReportPDF.js";
import { generateRatingReportPDF } from "../layout/RatingReportPDF.js";
import { generateSummaryReportPDF } from "../layout/SummaryReportPDF.js";

export const showReportsAdmin = async (req, res) => {
  try {

    await createServiceIssueReport(req, res, true);
    await createSixMonthTrendReport(req, res, true);

  
    const totalFeedback = await Feedback.countDocuments();
    const avgRatingAgg = await Rating.aggregate([
      { $group: { _id: null, avgOverall: { $avg: "$overallExperience" } } },
    ]);
    const avgRating = avgRatingAgg[0]?.avgOverall?.toFixed(2) || 0;
    const uniqueCustomers = await Customer.countDocuments();


    const feedbacks = await Feedback.find({}).populate("ratingID").lean();
    const feedbackStats = feedbacks.map(f => ({
      orNumber: f.orNumber,
      customerName: f.customerName || "Anonymous",
      category: f.category,
      menuItems: f.menuItems || [],
      message: f.message,
      rating: f.ratingID?.overallExperience || 0,
      createdAt: f.createdAt,
    }));

    const stats = { totalFeedback, avgRating, uniqueCustomers, feedbacks: feedbackStats };


    const reports = await Report.find({}).populate("generatedBy", "_id username role").sort({ createdAt: -1 }).lean();
    const lastGeneratedReport = reports[0]?.createdAt || null;


    const templates = [
      { title: "Monthly Summary", format: "PDF", description: "Comprehensive monthly feedback overview", includes: ["Total Feedback","Average Rating","Category Breakdown","Response Times"] },
      { title: "Customer Satisfaction", format: "PDF/Excel", description: "Customer satisfaction analysis and trends", includes: ["Rating Distribution","Sentiment Analysis","Customer Segments"] },
      { title: "Operational Insights", format: "PDF", description: "Operational improvements based on feedback", includes: ["Common Issues","Peak Hour Analysis","Staff Performance"] },
      { title: "Executive Summary", format: "PDF", description: "High-level overview for management", includes: ["Key Metrics","Trends","Recommendations","Action Items"] },
    ];

 
    const scheduledReports = await ScheduledReport.find({}).sort({ nextRun: 1 }).lean();

    const customReports = await CustomReport.find({}).sort({ createdAt: -1 }).lean();
    const customReportsData = customReports.map(r => ({
      _id: r._id,
      title: r.title,
      status: r.status,
      description: r.description,
      dateRange: r.dateRange,
      keyFinding: r.keyFinding,
      trendData: r.trendData || null
    }));
    const lastGeneratedCustom = customReports[0]?.createdAt || null;


    const lastGeneratedPrintable = feedbacks[0]?.createdAt || null;


    res.render("analytics/reportAdmin", {
      user: req.user,
      stats,
      reports,
      lastGeneratedReport,
      templates,
      scheduledReports,
      customReports: customReportsData,
      lastGeneratedCustom,
      lastGeneratedPrintable,
      customTab: true,
      selectedMonth: ""
    });

  } catch (err) {
    console.error("Error in ReportsAdminController:", err);
    res.status(500).send("Server Error");
  }
};
export const generateReport = async (req, res) => {
  try {
    const { type, customTitle, month, year } = req.body;
    const reportTitle = customTitle || type;
    const fileName = reportTitle.replace(/\s+/g, "_");
    const now = new Date();

    if (!month || !year) {
      return res.status(400).send("Please select both month and year.");
    }

    const startDate = new Date(year, parseInt(month) - 1, 1);
    const endDate = new Date(year, parseInt(month), 0, 23, 59, 59, 999);
    const matchCondition = { createdAt: { $gte: startDate, $lte: endDate } };
    let data = [];
    let summary = {};

    if (type === "Customer Report") {
      const feedbacks = await Feedback.find(matchCondition)
        .populate("customer")
        .lean();

      data = feedbacks.map(f => ({
        orNumber: f.orNumber,
        customerName: f.customerName || "N/A",
        customerType: f.customerType || "N/A",
        customerEmail: f.customerEmail || "N/A",
        createdAt: f.createdAt?.toISOString() || "N/A",
      }));

      if (!data.length) {
        data = [{ Message: `No data for ${month}/${year}` }];
      }
    }

    else if (type === "Feedback Report") {
      const feedbacks = await Feedback.find(matchCondition)
        .populate("ratingID")
        .populate("menuID")
        .populate("customer")
        .lean();

      data = feedbacks.map(f => ({
        orNumber: f.orNumber || "N/A",
        customerName: f.customer?.name || "Anonymous",
        customerEmail: f.customer?.email || "N/A",
        menuItems: f.menuID?.map(m => m.itemName).join(", ") || "N/A",
        overallExperience: f.ratingID?.overallExperience ?? "N/A",
        comment: f.message || "No comment",
        createdAt: f.createdAt?.toISOString() || "N/A",
      }));

      if (!data.length) {
        data = [{ Message: `No data for ${month}/${year}` }];
      }
    }

    else if (type === "Menu Report") {
      data = await Feedback.aggregate([
        { $match: matchCondition },
        { $unwind: "$menuID" },
        { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
        { $unwind: { path: "$rating", preserveNullAndEmptyArrays: true } },
        { $group: { _id: "$menuID", feedbackCount: { $sum: 1 }, avgRating: { $avg: "$rating.overallExperience" } } },
        { $lookup: { from: "menus", localField: "_id", foreignField: "_id", as: "menu" } },
        { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
        { $project: { menuName: "$menu.itemName", feedbackCount: 1, avgRating: { $ifNull: ["$avgRating", 0] } } },
      ]);

      if (!data.length) data = [{ Message: `No data for ${month}/${year}` }];
    }

    else if (type === "Rating Report") {
      const ratings = await Rating.find(matchCondition).lean();
      data = ratings.map(r => ({
        overallExperience: r.overallExperience ?? "N/A",
        foodQuality: r.foodQuality ?? "N/A",
        ambiance: r.ambiance ?? "N/A",
        service: r.service ?? "N/A",
        valueForMoney: r.valueForMoney ?? "N/A",
        staffAttitude: r.staffAttitude ?? "N/A",
        bartenderAttitude: r.bartenderAttitude ?? "N/A",
        createdAt: r.createdAt?.toISOString() || "N/A",
      }));

      if (!data.length) data = [{ Message: `No data for ${month}/${year}` }];
    }

    else if (type === "Summary Report") {
      const totalFeedback = await Feedback.countDocuments(matchCondition);
      const totalCustomers = await Customer.countDocuments(matchCondition);
      const ratings = await Rating.find(matchCondition).lean();

      const avgRating =
        ratings.length > 0
          ? (ratings.reduce((a, b) => a + (b.overallExperience || 0), 0) / ratings.length).toFixed(2)
          : 0;

      summary = {
        period: `${month}/${year}`,
        totalFeedback,
        totalCustomers,
        avgRating,
        generatedBy: req.user.username,
        generatedOn: now.toLocaleString(),
      };
    }

    const newReport = new Report({
      generatedBy: req.user._id,
      title: reportTitle,
      summary: type,
      createdAt: new Date(),
      filePath: `reports/${fileName}.csv`,
    });
    await newReport.save();

    const csvData =
      type === "Summary Report"
        ? [summary]
        : data.map(row => {
            const result = {};
            Object.keys(row).forEach(k => {
              result[k] =
                typeof row[k] === "object" && row[k] !== null
                  ? JSON.stringify(row[k])
                  : row[k];
            });
            return result;
          });

    const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
    const csv = parser.parse(csvData);

    console.log("CSV Output:\n", csv);

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.csv"`);
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);

  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).send("Server Error");
  }
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const generatePrintableReport = async (req, res) => {
  try {
    const { month, type } = req.body;
    const user = req.user;

    let filter = {};

    if (month) {
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr, 10);
      const monthNum = parseInt(monthStr, 10);

      filter.$expr = {
        $and: [
          { $eq: [{ $year: "$createdAt" }, year] },
          { $eq: [{ $month: "$createdAt" }, monthNum] }
        ]
      };
    }

    const feedbacks = await Feedback.find(filter)
      .populate("ratingID")
      .populate("menuID")
      .lean();

    const validFeedbacks = feedbacks.filter(f => f.customerName && f.customerName !== "N/A");

    const stats = {
      totalFeedback: validFeedbacks.length,
      avgRating: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.overallExperience || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      avgFood: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.foodQuality || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      avgService: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.service || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      avgAmbiance: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.ambiance || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      avgValue: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.valueForMoney || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      avgStaff: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.staffAttitude || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      avgBartender: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.bartenderAttitude || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      uniqueCustomers: new Set(validFeedbacks.map(f => f.customerName)).size,
      feedbacks: validFeedbacks.map(f => ({
        orNumber: f.orNumber,
        customerName: f.customerName,
        category: f.category,
        menuItems: f.menuID?.map(m => m.itemName) || [],
        message: f.message,
        rating: f.ratingID?.overallExperience || 0,
        createdAt: f.createdAt,
      })),
    };

    if (!validFeedbacks.length) {
      stats.menuLabels = [];
      stats.menuCounts = [];
      stats.customerLabels = [];
      stats.customerCounts = [];
      stats.feedbackLabels = ["1","2","3","4","5"];
      stats.feedbackCounts = [0,0,0,0,0];
      stats.topCategory = "N/A";
    } else {
      stats.menuLabels = [...new Set(validFeedbacks.flatMap(f => f.menuID?.map(m => m.itemName) || []))];
      stats.menuCounts = stats.menuLabels.map(label =>
        validFeedbacks.filter(f => f.menuID?.some(m => m.itemName === label)).length
      );

      stats.customerLabels = [...new Set(validFeedbacks.map(f => f.customerName))];
      stats.customerCounts = stats.customerLabels.map(label =>
        validFeedbacks.filter(f => f.customerName === label).length
      );

      stats.feedbackLabels = ["1","2","3","4","5"];
      stats.feedbackCounts = stats.feedbackLabels.map(label =>
        validFeedbacks.filter(f => f.ratingID?.overallExperience == Number(label)).length
      );

      const categoryCounts = {};
      validFeedbacks.forEach(f => {
        if(f.category){
          categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
        }
      });
      stats.topCategory = Object.keys(categoryCounts).length
        ? Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b)
        : "N/A";
    }

    const reportTypeMap = {
      customer: "Customer Report",
      feedback: "Feedback Report",
      menu: "Menu Report",
      rating: "Rating Report",
      summary: "Summary Report",
    };
    const reportTypeName = reportTypeMap[type] || "Feedback Report";

    const html = await ejs.renderFile(
      path.join(__dirname, "../views/reports/printableReport.ejs"),
      {
        stats,
        month,
        user,
        reportType: type,
        reportTypeName,
        generatedBy: user?.username || "System Administrator"
      }
    );

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm" },
    });

    await browser.close();

    res.setHeader("Content-Disposition", `attachment; filename=${reportTypeName}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};
export const previewPrintableReport = async (req, res) => {
  try {
    const { month, type } = req.body;
    const user = req.user;

    let filter = {};
    if (month) {
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr, 10);
      const monthNum = parseInt(monthStr, 10);

      filter.$expr = {
        $and: [
          { $eq: [{ $year: "$createdAt" }, year] },
          { $eq: [{ $month: "$createdAt" }, monthNum] }
        ]
      };
    }

    const feedbacks = await Feedback.find(filter)
      .populate("ratingID")
      .populate("menuID")
      .lean();

    const validFeedbacks = feedbacks.filter(f => f.customerName && f.customerName !== "N/A");

    const stats = {
      totalFeedback: validFeedbacks.length,
      avgRating: validFeedbacks.length ? (validFeedbacks.reduce((sum, f) => sum + (f.ratingID?.overallExperience || 0), 0) / validFeedbacks.length).toFixed(2) : 0,
      uniqueCustomers: new Set(validFeedbacks.map(f => f.customerName)).size,
      menuLabels: [...new Set(validFeedbacks.flatMap(f => f.menuID?.map(m => m.itemName) || []))],
      menuCounts: [],
      feedbackLabels: ["1","2","3","4","5"],
      feedbackCounts: [],
      topCategory: "N/A",
    };

    if (validFeedbacks.length) {
      stats.menuCounts = stats.menuLabels.map(label =>
        validFeedbacks.filter(f => f.menuID?.some(m => m.itemName === label)).length
      );
      stats.feedbackCounts = stats.feedbackLabels.map(label =>
        validFeedbacks.filter(f => f.ratingID?.overallExperience == Number(label)).length
      );

      const categoryCounts = {};
      validFeedbacks.forEach(f => {
        if(f.category) categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
      });
      stats.topCategory = Object.keys(categoryCounts).length
        ? Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b)
        : "N/A";
    }

    const reportTypeMap = {
      customer: "Customer Report",
      feedback: "Feedback Report",
      menu: "Menu Report",
      rating: "Rating Report",
      summary: "Summary Report",
    };
    const reportTypeName = reportTypeMap[type] || "Feedback Report";

    const html = await ejs.renderFile(
      path.join(__dirname, "../views/reports/printableReport.ejs"),
      {
        stats,
        month,
        user,
        reportType: type,
        reportTypeName,
        generatedBy: user?.username || "System Administrator"
      }
    );

    res.send(html);

  } catch (err) {
    console.error("Preview Report Error:", err);
    res.status(500).send("<div class='text-center text-danger py-5'>Server error generating preview.</div>");
  }
};
export const createServiceIssueReport = async (req, res, silent = false) => {
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const feedbacks = await Feedback.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate("ratingID").lean();

    if (!feedbacks.length) return silent ? null : res.status(200).json({ message: "No feedbacks found" });

    const weeks = [];
    let currentStart = startOfWeek(startDate, { weekStartsOn: 1 });
    while (currentStart <= endDate) {
      weeks.push({
        start: currentStart,
        end: endOfWeek(currentStart, { weekStartsOn: 1 }),
        feedbacks: []
      });
      currentStart = addWeeks(currentStart, 1);
    }

    feedbacks.forEach(fb => {
      const created = new Date(fb.createdAt);
      const week = weeks.find(w => created >= w.start && created <= w.end);
      if (week) week.feedbacks.push(fb);
    });

    const trendData = {
      labels: weeks.map(w => `${format(w.start, 'MM/dd')} - ${format(w.end, 'MM/dd')}`),
      values: weeks.map(w => {
        if (!w.feedbacks.length) return 0;
        const total = w.feedbacks.reduce((sum, f) => sum + (f.ratingID?.service || 0), 0);
        return parseFloat((total / w.feedbacks.length).toFixed(2));
      })
    };

    const serviceIssues = feedbacks.filter(f => f.ratingID?.service < 3).length;
    const total = feedbacks.length;
    const percentage = total > 0 ? ((serviceIssues / total) * 100).toFixed(2) : 0;

    const dateRange = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;

    const report = new CustomReport({
      title: "Service Issues Analysis",
      status: "Ready",
      description: "Detailed analysis of service-related feedback (Weekly Breakdown)",
      dateRange,
      keyFinding: `${percentage}% of service ratings below 3 this month`,
      trendData,
      feedbacks
    });

    await report.save();

    if (!silent && req.query.format === "csv") {
      const csvData = feedbacks.map(f => ({
        Date: new Date(f.createdAt).toISOString().slice(0, 10),
        Customer: f.customerName || "Anonymous",
        ORNumber: f.orNumber || "-",
        ServiceRating: f.ratingID?.service ?? "",
        FoodRating: f.ratingID?.foodQuality ?? "",
        AmbianceRating: f.ratingID?.ambiance ?? "",
        ValueRating: f.ratingID?.valueForMoney ?? "",
        StaffRating: f.ratingID?.staffAttitude ?? "",
        BartenderRating: f.ratingID?.bartenderAttitude ?? "",
        Issue: f.ratingID?.service < 3 ? "Yes" : "No"
      }));

      const parser = new Parser();
      const csv = parser.parse(csvData);
      res.setHeader("Content-Disposition", `attachment; filename="service_issues_report.csv"`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    console.log("✅ Weekly Service Issues Report Generated!");
    return report;

  } catch (err) {
    console.error("❌ Error generating weekly report:", err);
    if (!silent) res.status(500).send("Server Error");
  }
};
export const createSixMonthTrendReport = async (req, res, silent = false) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 5);

    const months = [];
    const monthLabels = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date(sixMonthsAgo);
      date.setMonth(sixMonthsAgo.getMonth() + i);
      months.push({ year: date.getFullYear(), month: date.getMonth() });
      monthLabels.push(date.toLocaleString("default", { month: "short", year: "numeric" }));
    }

    const trendValues = [];
    const allFeedbacks = [];

    for (const m of months) {
      const start = new Date(m.year, m.month, 1);
      const end = new Date(m.year, m.month + 1, 0, 23, 59, 59);

      const feedbacks = await Feedback.find({ createdAt: { $gte: start, $lte: end } })
        .populate("ratingID")
        .lean();

      allFeedbacks.push(...feedbacks);

      const avg = feedbacks.length
        ? feedbacks.reduce((acc, f) => acc + (f.ratingID?.overallExperience || 0), 0) / feedbacks.length
        : 0;
      trendValues.push(Number(avg.toFixed(2)));
    }

    const report = new CustomReport({
      title: "Customer Satisfaction Trends",
      status: "Ready",
      description: "6-month customer satisfaction trend analysis",
      dateRange: `${monthLabels[0]} - ${monthLabels[5]}`,
      keyFinding: `Overall satisfaction improved by ${trendValues[5] - trendValues[0]} points over 6 months`,
      trendData: { labels: monthLabels, values: trendValues },
      feedbacks: allFeedbacks
    });

    await report.save();

    if (!silent) {
      const format = req.query.format || "json";

      if (format === "csv") {
        const trendCsv = monthLabels.map((label, i) => ({
          Month: label,
          AvgOverallExperience: trendValues[i]
        }));

        const feedbackCsv = allFeedbacks.map(f => ({
          Date: f.createdAt.toISOString().slice(0, 10),
          Customer: f.customerName || "Anonymous",
          ORNumber: f.orNumber || "-",
          OverallExperience: f.ratingID?.overallExperience ?? "",
          ServiceRating: f.ratingID?.service ?? "",
          FoodRating: f.ratingID?.foodQuality ?? "",
          AmbianceRating: f.ratingID?.ambiance ?? "",
          ValueRating: f.ratingID?.valueForMoney ?? "",
          StaffRating: f.ratingID?.staffAttitude ?? "",
          BartenderRating: f.ratingID?.bartenderAttitude ?? "",
          Issue: f.ratingID?.service < 3 ? "Yes" : "No"
        }));

        const parser = new Parser();
        const trendCsvString = parser.parse(trendCsv);
        const feedbackCsvString = parser.parse(feedbackCsv);

        const csvCombined = `Trend Analytics\n${trendCsvString}\n\nDetailed Feedbacks\n${feedbackCsvString}`;

        res.setHeader("Content-Disposition", `attachment; filename="customer_satisfaction_trends.csv"`);
        res.setHeader("Content-Type", "text/csv");
        return res.send(csvCombined);
      }

      return res.status(200).json({ message: "6-Month Trend Report Generated!", report });
    }

    console.log("6-Month Trend Report Generated!");
    return report;

  } catch (err) {
    console.error(err);
    if (!silent) res.status(500).send("Server Error");
  }
};
export const showCustomReportsPage = async (req, res) => {
  try {
    await createServiceIssueReport(req, res, true);
    await createSixMonthTrendReport(req, res, true);

    const customReports = await CustomReport.find({}).sort({ createdAt: -1 }).lean();
    res.render("analytics/reportAdmin/customReportsPage", { customReports, customTab: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export const downloadCustomReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { format } = req.query; 

    const report = await CustomReport.findById(id).lean();
    if (!report) return res.status(404).send("Report not found");

    if (format === "csv") {
      const trendCsv = report.trendData?.labels?.length
        ? report.trendData.labels.map((label, i) => ({
            Month: label,
            AvgOverallExperience: report.trendData.values[i] ?? ""
          }))
        : [];

      const feedbackCsv = report.feedbacks?.length
        ? report.feedbacks.map(f => ({
            Date: new Date(f.createdAt).toISOString().slice(0, 10),
            Customer: f.customerName || "Anonymous",
            ORNumber: f.orNumber || "-",
            OverallExperience: f.ratingID?.overallExperience ?? "",
            ServiceRating: f.ratingID?.service ?? "",
            FoodRating: f.ratingID?.foodQuality ?? "",
            AmbianceRating: f.ratingID?.ambiance ?? "",
            ValueRating: f.ratingID?.valueForMoney ?? "",
            StaffRating: f.ratingID?.staffAttitude ?? "",
            BartenderRating: f.ratingID?.bartenderAttitude ?? "",
            Issue: f.ratingID?.service < 3 ? "Yes" : "No"
          }))
        : [];

      const parser = new Parser();
      const csvString =
        (trendCsv.length ? `Trend Analytics\n${parser.parse(trendCsv)}\n\n` : "") +
        (feedbackCsv.length ? `Detailed Feedbacks\n${parser.parse(feedbackCsv)}` : "");

      res.setHeader("Content-Disposition", `attachment; filename="${report.title}.csv"`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csvString);
    }

    const templateFile = report.title.includes("Service")
      ? "serviceIssueReport.ejs"
      : "sixMonthTrendReport.ejs";

    const html = await ejs.renderFile(
      path.join(process.cwd(), "src/views/reports", templateFile),
      { report, user: req.user }
    );

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm" }
    });
    await browser.close();

    res.setHeader("Content-Disposition", `attachment; filename="${report.title}.pdf"`);
    res.setHeader("Content-Type", "application/pdf");
    return res.send(pdfBuffer);

  } catch (err) {
    console.error("Download Custom Report Error:", err);
    res.status(500).send("Server Error");
  }
};


export const deleteCustomReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await CustomReport.findById(id);
    if (!report) return res.sendStatus(404);

    await CustomReport.deleteOne({ _id: id });
    res.sendStatus(200);
  } catch (err) {
    console.error("Delete Custom Report Error:", err);
    res.sendStatus(500);
  }
};