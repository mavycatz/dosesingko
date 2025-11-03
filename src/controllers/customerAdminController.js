import Customer from "../models/Customer.js";
import Feedback from "../models/FeedbackModel.js";
export const showCustomerAdminPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const { search, year, month, day } = req.query || {};
    const filter = { archived: false };

    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      filter.$or = [
        { message: regex },
        { orNumber: regex },
        { customerName: regex }
      ];
    }

    if (year || month || day) {
      const now = new Date();
      const y = year ? parseInt(year) : 1970;
      const m = month ? parseInt(month) - 1 : 0;
      const d = day ? parseInt(day) : 1;

      let startDate, endDate;

      if (year && month && day) {
        startDate = new Date(y, m, d, 0, 0, 0);
        endDate = new Date(y, m, d, 23, 59, 59);
      } else if (year && month) {
        startDate = new Date(y, m, 1, 0, 0, 0);
        endDate = new Date(y, m + 1, 0, 23, 59, 59);
      } else if (year && !month && !day) {
        startDate = new Date(y, 0, 1, 0, 0, 0);
        endDate = new Date(y, 11, 31, 23, 59, 59);
      } else if (month && !year) {
        const currentYear = now.getFullYear();
        startDate = new Date(currentYear, m, 1, 0, 0, 0);
        endDate = new Date(currentYear, m + 1, 0, 23, 59, 59);
      } else if (day && !month && !year) {
        startDate = new Date(now.getFullYear(), now.getMonth(), d, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), d, 23, 59, 59);
      }

      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const totalFeedbackCount = await Feedback.countDocuments(filter);

    const feedbacks = await Feedback.find(filter)
      .populate("menuID")
      .populate("ratingID")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalFeedbackCount / limit);

    const allCustomers = await Customer.find().select("orNumber").lean();
    const submittedORs = await Feedback.distinct("orNumber", filter);
    const pendingORs = allCustomers
      .filter(c => !submittedORs.includes(c.orNumber))
      .map(c => c.orNumber);

    const feedbackData = {
      totalCustomers: allCustomers.length,
      totalFeedback: submittedORs.length,
      pendingFeedback: pendingORs.length
    };

    res.render("analytics/customerAdmin", {
      feedbacks,
      feedbackData,
      pendingORs,
      currentPage: page,
      totalPages,
      query: req.query,
      currentYear: new Date().getFullYear(),
      monthNames: [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
      ]
    });

  } catch (err) {
    console.error("Error in showCustomerAdminPage:", err);
    res.status(500).send("Server Error");
  }
};


export const addORNumber = async (req, res) => {
  try {
    if (req.session.userRole !== "cashier") {
      return res.status(403).json({ error: "Access denied. Only cashiers can add OR Numbers." });
    }

    const { orNumber } = req.body;
    if (!orNumber) return res.status(400).json({ error: "OR Number is required" });

    const existing = await Customer.findOne({ orNumber });
    if (existing) return res.status(400).json({ error: "OR Number already exists" });

    const customer = new Customer({ orNumber });
    await customer.save();

    res.status(201).json({ message: "OR Number added", customer });
  } catch (err) {
    console.error("addORNumber failed:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const deleteORNumber = async (req, res) => {
  try {
    let { orNumber } = req.params;


    const customer = await Customer.findOne({ orNumber });
    if (!customer) {
      return res.status(404).json({ success: false, message: "OR number not found." });
    }

    await Customer.deleteOne({ orNumber });

    res.json({ success: true, message: `OR number ${orNumber} deleted successfully.` });
  } catch (err) {
    console.error("Error deleting OR number:", err);
    res.status(500).json({ success: false, message: "Server error while deleting OR number." });
  }
};

