import Feedback from "../models/FeedbackModel.js";
import Rating from "../models/Rating.js";
import Menu from "../models/Menu.js";
import Customer from "../models/Customer.js";
import Chart from 'chart.js/auto';
import 'chartjs-chart-matrix';
import { startOfWeek, endOfWeek, addWeeks, getMonth, getYear, startOfMonth, endOfMonth, addDays, min} from 'date-fns';

export const buildFilters = async (query) => {
  const filters = {};


  if (query.dateFrom || query.dateTo) {
    filters.createdAt = {};
    if (query.dateFrom) filters.createdAt.$gte = new Date(`${query.dateFrom}T00:00:00`);
    if (query.dateTo) filters.createdAt.$lte = new Date(`${query.dateTo}T23:59:59`);
  }


  if (query.customerType) filters.customerType = query.customerType;


  if (query.category) {
    const menus = await Menu.find({ itemCategory: query.category }).select("_id");
    if (menus.length > 0) filters.menuID = { $in: menus.map(m => m._id) };
  }

  return filters;
};


export const getCategories = async (req, res) => {
  try {
    const categories = await Menu.distinct("itemCategory");
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const getCustomerTypes = async (req, res) => {
  try {
    const types = await Feedback.distinct("customerType");
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const getFilteredFeedback = async (req, res) => {
  try {
    const filter = await buildFilters(req.query);

    let feedbacks = await Feedback.find(filter)
      .populate("ratingID")
      .populate("menuID")
      .lean();

    if (!feedbacks.length) {
      return res.json({
        success: true,
        feedbacks: [],
        stats: {
          totalFeedback: 0,
          avgRating: 0,
          satisfactionRate: 0,
          avgResponseTime: 0
        }
      });
    }


    const overallRatings = feedbacks
      .map(fb => fb.ratingID?.overallExperience)
      .filter(r => typeof r === "number");

    const totalRatings = overallRatings.length;
    const avgRating = totalRatings ? overallRatings.reduce((a, b) => a + b, 0) / totalRatings : 0;
    const satisfiedCount = overallRatings.filter(r => r >= 4).length;
    const satisfactionRate = totalRatings ? ((satisfiedCount / totalRatings) * 100).toFixed(2) : "0";
    const avgResponseTime = feedbacks.length
      ? feedbacks.reduce((sum, fb) => sum + (fb.ratingID?.responseTime || 0), 0) / feedbacks.length
      : 0;

    res.json({
      success: true,
      feedbacks,
      stats: {
        totalFeedback: feedbacks.length,
        avgRating: parseFloat(avgRating.toFixed(2)),
        satisfactionRate,
        avgResponseTime: parseFloat(avgResponseTime.toFixed(2))
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

export const getStatsCards = async (req, res) => {
  try {
    const { dateFrom, dateTo, category, customerType } = req.query;


    const feedbackFilter = {};
    if (dateFrom || dateTo) {
      feedbackFilter.createdAt = {};
      if (dateFrom) feedbackFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) feedbackFilter.createdAt.$lte = new Date(dateTo);
    }
    if (customerType) feedbackFilter.customerType = customerType;

    const pipeline = [
      { $match: feedbackFilter },
      { $unwind: { path: "$menuID", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "menus", localField: "menuID", foreignField: "_id", as: "menu" } },
      { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
      { $unwind: { path: "$rating", preserveNullAndEmptyArrays: true } },
    ];


    if (category) pipeline.push({ $match: { "menu.itemCategory": category } });


    pipeline.push({
      $group: {
        _id: null,
        totalFeedback: { $sum: 1 },
        avgRating: { $avg: "$rating.overallExperience" },
        satisfiedCount: {
          $sum: { $cond: [{ $gte: ["$rating.overallExperience", 4] }, 1, 0] }
        },
        feedbacksWithReplies: {
          $push: {
            $cond: [{ $gt: [{ $size: "$replies" }, 0] }, "$$ROOT", "$$REMOVE"]
          }
        }
      }
    });

    const result = await Feedback.aggregate(pipeline);

    if (!result.length) {
      return res.json({
        totalFeedback: 0,
        avgRating: 0,
        satisfactionRate: 0,
        avgResponseTime: 0
      });
    }

    const stats = result[0];
    const totalFeedback = stats.totalFeedback;
    const avgRating = stats.avgRating ? parseFloat(stats.avgRating.toFixed(2)) : 0;
    const satisfactionRate = totalFeedback
      ? parseFloat(((stats.satisfiedCount / totalFeedback) * 100).toFixed(2))
      : 0;


    const totalResponseTime = stats.feedbacksWithReplies.reduce((sum, f) => {
      const firstReply = f.replies[0].createdAt;
      return sum + ((new Date(firstReply) - new Date(f.createdAt)) / (1000 * 60));
    }, 0);

    const avgResponseTime = stats.feedbacksWithReplies.length
      ? parseFloat((totalResponseTime / stats.feedbacksWithReplies.length).toFixed(2))
      : 0;

    res.json({ totalFeedback, avgRating, satisfactionRate, avgResponseTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


function buildWeeks(startDate, endDate) {
  const weeks = [];
  let weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  while (weekStart <= endDate) {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    weeks.push({ start: weekStart, end: weekEnd > endDate ? endDate : weekEnd });
    weekStart = addWeeks(weekStart, 1);
  }
  return weeks;
}
export const getWeeklyFeedbackTrends = async (req, res) => {
  try {
    const { dateFrom, dateTo, category, customerType } = req.query;
    const now = new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const weeks = buildWeeks(startDate, endDate);
    const labels = weeks.map(
      (w, i) => `Week ${i + 1} (${w.start.getMonth()+1}/${w.start.getDate()} - ${w.end.getMonth()+1}/${w.end.getDate()})`
    );

    const negativeRatings = [];
    const positiveRatings = [];
    const avgRatings = [];
    const totalFeedback = [];

    const customerTypeMap = {
      "Dine-In": "Dine-in",
      "Take-Out": "Take-out",
      "Delivery": "Delivery"
    };

    for (const w of weeks) {
      const matchStage = {
        createdAt: { $gte: w.start, $lte: w.end },
        overallExperience: { $ne: null }
      };

      if (customerType && customerType.trim() !== "") {
        matchStage.customerType = customerTypeMap[customerType] || customerType;
      }

      if (category && category.trim() !== "") {
        matchStage["menu.itemCategory"] = category;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avg: { $avg: "$overallExperience" },
            posRatings: {
              $push: {
                $cond: [{ $gte: ["$overallExperience", 3.5] }, "$overallExperience", "$$REMOVE"]
              }
            },
            negRatings: {
              $push: {
                $cond: [{ $lt: ["$overallExperience", 3.5] }, "$overallExperience", "$$REMOVE"]
              }
            }
          }
        }
      ];

      const result = await Rating.aggregate(pipeline);

      if (result.length) {
        const r = result[0];
        const avg = r.avg || 0;
        const pos = r.posRatings.length ? r.posRatings.reduce((a,b)=>a+b,0)/r.posRatings.length : 0;
        const neg = r.negRatings.length ? r.negRatings.reduce((a,b)=>a+b,0)/r.negRatings.length : 0;

        avgRatings.push(avg);
        positiveRatings.push(pos);
        negativeRatings.push(neg);
        totalFeedback.push(r.total);
      } else {
        avgRatings.push(0);
        positiveRatings.push(0);
        negativeRatings.push(0);
        totalFeedback.push(0);
      }
    }

    const lastWeekIndex = weeks.findIndex(w => w.start > now);

    function linearRegressionPredict(arr) {
      const predicted = [...arr];
      const known = arr.map((v,i) => ({v,i})).filter(x => x.v !== 0);
      const n = known.length;
      if (n === 0) return predicted;

      const sumX = known.reduce((a,b) => a+b.i,0);
      const sumY = known.reduce((a,b) => a+b.v,0);
      const sumXY = known.reduce((a,b) => a+b.i*b.v,0);
      const sumX2 = known.reduce((a,b) => a+b.i*b.i,0);

      const m = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
      const b = (sumY - m*sumX)/n;

      for (let i = 0; i < arr.length; i++) {
        if (i >= lastWeekIndex && arr[i] === 0) {
          predicted[i] = m*i + b;
        }
      }
      return predicted;
    }

    const predictedAvg = linearRegressionPredict(avgRatings);
    const predictedPos = linearRegressionPredict(positiveRatings);
    const predictedNeg = linearRegressionPredict(negativeRatings);
    const predictedTotal = linearRegressionPredict(totalFeedback);

    const predictedFlags = weeks.map((w,i) => i >= lastWeekIndex);

    res.json({
      labels,
      negativeRatings: predictedNeg,
      positiveRatings: predictedPos,
      avgRatings: predictedAvg,
      totalFeedback: predictedTotal,
      predictedFlags 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getWeeklyFeedbackVolumeAndRating = async (req, res) => {
  try {
    const { dateFrom, dateTo, category, customerType } = req.query;
    const today = new Date();
    const startDate = dateFrom ? new Date(dateFrom) : startOfMonth(today);
    const endDate = dateTo ? new Date(dateTo) : endOfMonth(today);

    const weeks = buildWeeks(startDate, endDate);
    const labels = weeks.map(
      w => `${w.start.getMonth() + 1}/${w.start.getDate()} - ${w.end.getMonth() + 1}/${w.end.getDate()}`
    );

    const totalFeedback = [];
    const avgRating = [];

    for (let w of weeks) {
      const agg = await Feedback.aggregate([
        { $match: { createdAt: { $gte: w.start, $lte: w.end } } },
        { $unwind: { path: "$menuID", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "menus", localField: "menuID", foreignField: "_id", as: "menu" } },
        { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
        { $unwind: { path: "$rating", preserveNullAndEmptyArrays: true } },
        { $match: {
            ...(category ? { "menu.itemCategory": category } : {}),
            ...(customerType ? { customerType } : {})
        }},
        { $group: {
            _id: null,
            total: { $sum: 1 },
            avg: { $avg: "$rating.overallExperience" }
        }}
      ]);

      if (agg.length > 0) {
        totalFeedback.push(agg[0].total);
        avgRating.push(agg[0].avg != null ? parseFloat(agg[0].avg.toFixed(2)) : 0);
      } else {
        totalFeedback.push(0);
        avgRating.push(0);
      }
    }

    res.json({ labels, totalFeedback, avgRating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
export const getSentimentTrends = async (req, res) => {
  try {
    const { dateFrom, dateTo, customerType } = req.query;
    const now = new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const weeks = buildWeeks(startDate, endDate);

    const categoryWords = {
      "Food Quality": {
        positive: [
          "good","tasty","delicious","fresh","masarap","malasa","well-cooked","perfect","flavorful","excellent",
          "sarap","maayos","freshly prepared","perfectly seasoned","appetizing","lovely taste","enjoyable meal",
          "great flavor","high-quality ingredients","well-prepared","satisfying","nice portion","well-served",
          "pleasant taste","well-presented","beautifully plated","awesome","superb","mouthwatering","fresh ingredients",
          "crispy","soft","juicy","rich flavor","perfect texture","pleasantly seasoned","well-cooked rice","good aroma",
          "lovely presentation","delightful","freshly made","perfectly baked","well-marinated","excellent dish",
          "tender","soft texture","well-spiced","well-balanced","perfectly fried"
        ],
        negative: [
          "bad","cold","bland","stale","overcooked","undercooked","greasy","tasteless","unfresh","rotten",
          "hilaw","malansa","lutong-luma","masama","pangit","dry","hard","unappetizing","spoiled","matigas",
          "malambot","tuyo","hindi-sarap","hindi-kaaya-aya","over-seasoned","under-seasoned","hindi-luto","masangsang",
          "hindi-fresh","bad flavor","disappointing","not tasty","poor quality","overcooked rice","unpleasant taste",
          "hard texture","chewy","soggy","rubbery","bad aroma","unpleasant smell","failed dish","not enjoyable",
          "tasteless rice","bad seasoning","unpleasant texture","badly cooked","burnt","cold serving","inedible",
          "wasted","poorly prepared"
        ],
        phrasesPositive: [
          "delicious food","well-cooked meal","fresh ingredients","perfectly seasoned","sarap na pagkain",
          "masarap na ulam","lovely taste","enjoyable meal","well-prepared dish","high-quality ingredients"
        ],
        phrasesNegative: [
          "cold food","bland taste","overcooked meal","undercooked rice","hilaw na pagkain","malansa",
          "spoiled dish","unappetizing meal","bad flavor","disappointing taste"
        ]
      },
      "Ambiance": {
        positive: [
          "pleasant","cozy","comfortable","welcoming","clean","organized","bright","well-decorated","spacious",
          "quiet","relaxing","nice","beautiful","maayos","maganda","maginhawa","malinis","ayos","welcoming vibe",
          "great atmosphere","enjoyable environment","pleasant space","lovely ambiance","peaceful","inviting","appealing",
          "welcoming staff","comfortable seating","pleasantly decorated","beautifully arranged","well-lit",
          "good lighting","airy","open space","calm","soft music","good vibe","friendly environment","well-kept",
          "welcoming setting","relaxing atmosphere","pleasant environment","tidy","welcoming decor","welcoming space",
          "well-maintained","attractive","organized layout","comfortable environment","good interior","welcoming feeling"
        ],
        negative: [
          "noisy","crowded","dark","dirty","uncomfortable","chaotic","messy","cramped","stuffy","overdecorated",
          "malungkot","maingay","madilim","marumi","hindi-komportable","siksikan","magulo","hindi-kaaya-aya",
          "stuffy air","overcrowded","bad lighting","unpleasant","harsh","cold","hindi-welcome","nakakadismaya",
          "cluttered","unpleasant vibe","disorganized","stressful","unfriendly environment","bad smell",
          "hindi-maginhawa","nakakainis","unwelcoming","poor maintenance","unpleasant decor","uncomfortable seating",
          "bad ambiance","too dark","too bright","hindi-kaaya-ayang lugar","uninviting","noisy crowd","disturbing",
          "messy tables","over-decorated","too small","unpleasant arrangement","uncomfortable chairs","untidy",
          "not relaxing"
        ],
        phrasesPositive: [
          "pleasant ambiance","cozy environment","comfortable seating","welcoming atmosphere","malinis at maayos"
        ],
        phrasesNegative: [
          "noisy environment","crowded place","dark ambiance","dirty area","hindi-komportable","stuffy place"
        ]
      },
      "Service": {
        positive: [
          "friendly","attentive","helpful","professional","efficient","polite","maayos","magalang","prompt",
          "well-trained","cooperative","courteous","welcoming","good service","nice staff","organized",
          "respectful","pleasant","supportive","kind","engaging","welcoming staff","fast service","excellent support",
          "considerate","knowledgeable","well-behaved","reliable","patient","great assistance","good attitude",
          "well-mannered","accommodating","proactive","helpful staff","pleasant interaction","well-organized",
          "efficient staff","friendly waiter","well-served","attentive staff","good hospitality","excellent behavior",
          "polite staff","welcoming behavior","smooth service","professional staff","friendly approach","top-notch service",
          "excellent care","good response","prompt attention"
        ],
        negative: [
          "rude","unfriendly","slow","neglectful","careless","inattentive","hindi-mabait","bastos","hindi-magalang",
          "madalang tumugon","unhelpful","impolite","disrespectful","unorganized","forgetful","confusing","abrupt",
          "cold","unapproachable","distant","short-tempered","untrained","nakakainis","pabaya","malamig",
          "disappointing service","hindi-kaaya-aya","bad attitude","poor support","late response","uncooperative",
          "hindi-responsive","hindi-masipag","disrespectful staff","inconsiderate","hindi-profesyonal",
          "nagagalit","madulas","nakakainis na behavior","poor behavior","slow staff","unpleasant interaction",
          "not attentive","unpleasant","nakakainis na serbisyo","malamig na staff","hindi-friendly","nakakainis na experience"
        ],
        phrasesPositive: [
          "friendly staff","attentive service","helpful staff","good service","maayos na serbisyo"
        ],
        phrasesNegative: [
          "slow service","rude staff","unfriendly behavior","hindi-mabait na staff","disrespectful service"
        ]
      },
      "Value for Money": {
        positive: [
          "worth it","affordable","good value","reasonable price","cheap","sulit","hindi-mahal","mura",
          "bang-for-buck","worth the money","fair price","excellent deal","value for money","reasonable cost",
          "hindi-sobrang-mahal","budget-friendly","cost-effective","worth every peso","reasonable charge",
          "satisfactory price","affordable meal","good deal","good bargain","justifiable price","not overpriced",
          "economical","hindi-masyadong-mahal","value meal","fair deal","worth paying","hindi-mura-mura","reasonable spending",
          "great value","well-priced","good cost","hindi-sobra","fair cost","sensible price","hindi-masyado","good investment",
          "reasonable expense","hindi-hindi","practical price","worthwhile","hindi-waste","hindi-sayang","hindi-mahal pero kalidad"
        ],
        negative: [
          "expensive","overpriced","wasteful","cheap-looking","not-worth","unfair","poor-quality","excessive","disappointing",
          "inflated","overcharged","costly","substandard","low-value","unsatisfactory","rip-off","pricey","unreasonable",
          "mahal","sobrang-mahal","sayang","murang-mura","hindi-sulit","hindi-makatarungan","mababa","sobra",
          "nakakadismaya","pinagpapalaki","sobrang presyo","mababa ang kalidad","hindi-nasiyahan","pangit","hindi-saya",
          "hindi sulit","hindi-abot sa halaga","overpriced meal","not worth the price","high cost","hindi-makatarungan",
          "hindi-bang-for-buck","too expensive","overly pricey","hindi-budget-friendly","hindi-cost-effective","not economical"
        ],
        phrasesPositive: [
          "good value","worth it","reasonable price","bang-for-buck","value for money","sulit","hindi-mahal"
        ],
        phrasesNegative: [
          "expensive","overpriced","not worth","hindi-sulit","sobrang-mahal","wasteful","too pricey"
        ]
      },
      "Staff/Bartender Attitude": {
        positive: [
          "friendly","helpful","polite","attentive","professional","maayos","magalang","welcoming","efficient",
          "cooperative","pleasant","kind","well-mannered","accommodating","proactive","courteous","knowledgeable",
          "welcoming staff","good attitude","top-notch service","excellent care","smooth service","respectful",
          "engaging","supportive","well-trained","pleasant interaction","well-behaved","good response","prompt attention",
          "hindi-malasakit","hindi-bastos","hindi-mabait","maayos na attitude","friendly bartender","attentive staff",
          "helpful staff","welcoming behavior","good service","professional staff","well-organized","fast response",
          "pleasant demeanor","good communication","welcoming smile","polite staff","excellent behavior","reliable"
        ],
        negative: [
          "rude","unfriendly","impolite","cold","arrogant","careless","lazy","dismissive","disrespectful","unhelpful",
          "unprofessional","short-tempered","ignorant","uncooperative","inattentive","indifferent","untrained",
          "abrupt","unwelcoming","inconsiderate","bastos","hindi-mabait","hindi-magalang","malamig","mayabang",
          "pabaya","tamad","walang-pansin","walang-respeto","walang-tulong","hindi-propesyonal","madaling mainis",
          "hindi-cooperate","walang-pakialam","hindi-sanay","hindi-welcome","nakakainis","hindi-kaaya-aya",
          "malamig na staff","disrespectful staff","slow service","poor attitude","bad behavior","not helpful"
        ],
        phrasesPositive: [
          "friendly staff","attentive service","helpful staff","good attitude","maayos na staff","welcoming behavior"
        ],
        phrasesNegative: [
          "rude staff","unfriendly behavior","disrespectful service","hindi-mabait na staff","bad attitude","lazy staff"
        ]
      }
    };

    const getTextSentiment = (text, category) => {
      if (!text || !categoryWords[category]) return 0;
      let score = 0;
      const lowerText = text.toLowerCase();

      const { positive: pWords, negative: nWords, phrasesPositive: pPhrases, phrasesNegative: nPhrases } = categoryWords[category];

      pPhrases.forEach(p => { if (lowerText.includes(p)) score += 2; });
      nPhrases.forEach(p => { if (lowerText.includes(p)) score -= 2; });

      lowerText.split(/\W+/).forEach(word => {
        if (pWords.includes(word)) score += 1;
        if (nWords.includes(word)) score -= 1;
      });

      return score;
    };

    const agg = await Feedback.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
      { $unwind: { path: "$rating", preserveNullAndEmptyArrays: true } },
      { $match: { ...(customerType ? { customerType } : {}) } },
      { $project: { createdAt: 1, rating: "$rating" } }
    ]);

    const sentiments = {};
    Object.keys(categoryWords).forEach(cat => {
      sentiments[cat] = { Negative: Array(weeks.length).fill(0), Neutral: Array(weeks.length).fill(0), Positive: Array(weeks.length).fill(0) };
    });

    agg.forEach(fb => {
      if (!fb.createdAt || !fb.rating) return;

      Object.keys(categoryWords).forEach(cat => {
        const reasonField = {
          "Food Quality": fb.rating.foodQualityReason,
          "Ambiance": fb.rating.ambianceReason,
          "Service": fb.rating.serviceReason,
          "Value for Money": fb.rating.valueForMoneyReason,
          "Staff/Bartender Attitude": fb.rating.staffAttitudeReason || fb.rating.bartenderAttitudeReason
        }[cat];

        let numericScore = fb.rating[{
          "Food Quality": "foodQuality",
          "Ambiance": "ambiance",
          "Service": "service",
          "Value for Money": "valueForMoney",
          "Staff/Bartender Attitude": "staffAttitude"
        }[cat]];

        let numericSentiment = "Neutral";
        if (numericScore !== undefined) {
          if (numericScore < 3.5) numericSentiment = "Negative";
          else if (numericScore >= 4.5) numericSentiment = "Positive";
        }

        const textScore = getTextSentiment(reasonField, cat);
        let textSentiment = "Neutral";
        if (textScore > 0) textSentiment = "Positive";
        else if (textScore < 0) textSentiment = "Negative";

        const finalSentiment = textScore !== 0 ? textSentiment : numericSentiment;

        const weekIndex = weeks.findIndex(w => fb.createdAt >= w.start && fb.createdAt <= w.end);
        if (weekIndex !== -1) sentiments[cat][finalSentiment][weekIndex]++;
      });
    });

    const labels = weeks.map((_, i) => `Week ${i + 1}`);
    res.json({ labels, ...sentiments });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
export const getMonthlyComparison = async (req, res) => {
  try {
    const filters = await buildFilters(req.query);
    let { dateFrom, dateTo, filterType } = req.query;

    let start, end;

    if (!dateFrom || !dateTo) {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      start = previousMonthStart;
      end = currentMonthEnd;
    } else {
      start = new Date(dateFrom);
      end = new Date(dateTo);
    }

    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    let effectiveFilterType = filterType || "month";

    let useTwoWeekGroup = false;
    if (!filterType && diffDays <= 14) {
      useTwoWeekGroup = true;
      effectiveFilterType = "week";
    }

    const agg = await Feedback.aggregate([
      { $match: { ...filters, createdAt: { $gte: start, $lte: end } } },
      { $unwind: { path: "$menuID", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "menus", localField: "menuID", foreignField: "_id", as: "menu" } },
      { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "ratingData" } },
      { $unwind: { path: "$ratingData", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          localDate: { $dateAdd: { startDate: "$createdAt", unit: "hour", amount: 8 } },
          overallExperienceNum: { $toDouble: "$ratingData.overallExperience" }
        }
      },
      {
        $addFields: {
          groupKey: useTwoWeekGroup
            ? { date: "$localDate" }
            : effectiveFilterType === "week"
            ? { year: { $isoWeekYear: "$localDate" }, week: { $isoWeek: "$localDate" } }
            : { year: { $year: "$localDate" }, month: { $month: "$localDate" } }
        }
      },
      {
        $group: {
          _id: "$groupKey",
          totalFeedback: { $sum: 1 },
          avgRating: { $avg: "$overallExperienceNum" }
        }
      },
      { $sort: { "_id.date": 1, "_id.year": 1, "_id.month": 1, "_id.week": 1 } }
    ]);

    const labels = [];
    const dataMap = {};
    const allMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    if (useTwoWeekGroup) {
      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const firstLabel = `${start.toLocaleDateString("default",{month:"short",day:"numeric"})} - ${midDate.toLocaleDateString("default",{month:"short",day:"numeric"})}`;
      const secondLabel = `${new Date(midDate.getTime() + 86400000).toLocaleDateString("default",{month:"short",day:"numeric"})} - ${end.toLocaleDateString("default",{month:"short",day:"numeric"})}`;

      const firstSet = agg.filter(a => new Date(a._id.date) <= midDate);
      const secondSet = agg.filter(a => new Date(a._id.date) > midDate);

      const firstCount = firstSet.reduce((sum,a)=>sum+a.totalFeedback,0);
      const firstAvg = firstSet.reduce((sum,a)=>sum+a.avgRating*a.totalFeedback,0)/Math.max(firstCount,1);

      const secondCount = secondSet.reduce((sum,a)=>sum+a.totalFeedback,0);
      const secondAvg = secondSet.reduce((sum,a)=>sum+a.avgRating*a.totalFeedback,0)/Math.max(secondCount,1);

      labels.push(firstLabel, secondLabel);
      dataMap[firstLabel] = { totalFeedback: firstCount, avgRating: parseFloat(firstAvg.toFixed(2)) };
      dataMap[secondLabel] = { totalFeedback: secondCount, avgRating: parseFloat(secondAvg.toFixed(2)) };
    } else {
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      for (let year=startYear; year<=endYear; year++){
        const startMonth = year===startYear ? start.getMonth() : 0;
        const endMonth = year===endYear ? end.getMonth() : 11;
        for (let month=startMonth; month<=endMonth; month++){
          const label = `${allMonths[month]} ${year}`;
          labels.push(label);
          dataMap[label] = { totalFeedback:0, avgRating:0 };
        }
      }

      agg.forEach(a=>{
        if (effectiveFilterType==="week"){
          const weekNum = a._id.week;
          const year = a._id.year;
          const label = `Week ${weekNum} (${year})`;
          dataMap[label] = { totalFeedback:a.totalFeedback, avgRating:parseFloat(a.avgRating?.toFixed(2))||0 };
          if (!labels.includes(label)) labels.push(label);
        } else {
          const month = a._id.month;
          const year = a._id.year;
          const label = `${allMonths[month-1]} ${year}`;
          if(dataMap[label]) dataMap[label] = { totalFeedback:a.totalFeedback, avgRating:parseFloat(a.avgRating?.toFixed(2))||0 };
        }
      });
    }

    res.json({ labels, data: dataMap });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};



export const getFeedbackVolumeByDay = async (req, res) => {
  try {
    const { category, customerType } = req.query;

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day; 
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const filters = { createdAt: { $gte: weekStart, $lte: weekEnd } };

    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const feedback = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const target = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

    const customerTypeMap = {
      "Dine-In": "Dine-in",
      "Take-Out": "Take-out",
      "Delivery": "Delivery"
    };

    const feedbackAgg = await Feedback.aggregate([
      { $match: filters },
      { $unwind: { path: "$menuID", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "menus",
          localField: "menuID",
          foreignField: "_id",
          as: "menu"
        }
      },
      { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(customerType ? { customerType: customerTypeMap[customerType] || customerType } : {}),
          ...(category ? { "menu.itemCategory": category } : {})
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          totalFeedback: { $sum: 1 }
        }
      }
    ]);

    feedbackAgg.forEach(item => {
      const day = dayMap[item._id - 1];
      feedback[day] = item.totalFeedback;
    });

    const customerFilters = { createdAt: { $gte: weekStart, $lte: weekEnd } };
    if (customerType) customerFilters.customerType = customerTypeMap[customerType] || customerType;

    const customers = await Customer.find(customerFilters).select("createdAt");

    customers.forEach(c => {
      const day = dayMap[new Date(c.createdAt).getDay()];
      target[day] += 1;
    });

    res.json({ feedback, target });
  } catch (err) {
    console.error("Error in getFeedbackVolumeByDay:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getTopCustomerIssues = async (req, res) => {
  try {
    const filters = await buildFilters(req.query);


    const feedbacks = await Feedback.find(filters).populate("ratingID").lean();
    if (!feedbacks.length) return res.json({ success: true, issues: [] });

    const categories = {
      "Food Quality": [
        "bad","bland","cold","stale","overcooked","undercooked","greasy","tasteless","unfresh","awful",
        "rotten","spoiled","over-seasoned","dry","mushy","hard","unappetizing","flavorless",
        "pangit","walang-lasa","malansa","hilaw","lutong-luma","masama","hindi-sariwa","madulas","masangsang","hindi-tama","amoy-pangit","masamang lasa","matigas","malambot","tuyo","hindi-kaaya-aya","hindi-sarap","tigas"
      ],
      "Ambiance": [
        "dull","noisy","uncomfortable","dark","crowded","dirty","chaotic","unpleasant","gloomy","bland","cramped","cluttered","overcrowded","stuffy","messy","unwelcoming","harsh","cold","over-decorated",
        "malungkot","maingay","hindi-komportable","madilim","siksikan","marumi","magulo","hindi-kaaya-aya","nakakadismaya","walang-anyo","masikip","makapal ang usok","hindi-welcome","malamig","masyadong dekorado"
      ],
      "Service": [
        "slow","rude","unfriendly","inattentive","inefficient","neglectful","careless","impolite","unhelpful","disrespectful","unorganized","forgetful","untrained","abrupt","confusing","indifferent","cold","unapproachable","distant",
        "mabagal","bastos","hindi-mabait","walang-pansin","hindi-epektibo","hindi-nakakaalaga","pabaya","hindi-magalang","walang-tulong","walang-respeto","hindi-ayos","nakakalimot","hindi-sanay","nakakalito","walang-pakialam","malamig","hindi-maabot","malayo"
      ],
      "Value for Money": [
        "expensive","overpriced","wasteful","cheap-looking","not-worth","unfair","poor-quality","excessive","disappointing","inflated","overcharged","costly","substandard","low-value","unsatisfactory","rip-off","pricey","unreasonable",
        "mahal","sobrang-mahal","sayang","murang-mura","hindi-sulit","hindi-makatarungan","mababa","sobra","nakakadismaya","pinagpapalaki","sobrang presyo","mababa ang kalidad","hindi-nasiyahan","pangit","hindi-saya"
      ],
      "Staff/Bartender Attitude": [
        "rude","unfriendly","impolite","cold","arrogant","careless","lazy","dismissive","disrespectful","unhelpful","unprofessional","short-tempered","ignorant","uncooperative","inattentive","indifferent","untrained","abrupt","unwelcoming","inconsiderate",
        "bastos","hindi-mabait","hindi-magalang","malamig","mayabang","pabaya","tamad","walang-pansin","walang-respeto","walang-tulong","hindi-propesyonal","madaling mainis","hindi-makayapa","hindi-cooperate","walang-pakialam","hindi-sanay","hindi-welcome","hindi-maka-konsidera"
      ]
    };

    let allWords = [];
    feedbacks.forEach(fb => {
      const r = fb.ratingID;
      if (!r) return;

      const fields = [
        { text: fb.message, source: "General" },
        { text: r.overallExperienceReason, source: "Overall Experience" },
        { text: r.foodQualityReason, source: "Food Quality" },
        { text: r.ambianceReason, source: "Ambiance" },
        { text: r.serviceReason, source: "Service" },
        { text: r.valueForMoneyReason, source: "Value for Money" },
        { text: r.staffAttitudeReason, source: "Staff Attitude" },
        { text: r.bartenderAttitudeReason, source: "Bartender Attitude" },
        { text: r.recommendToOthersReason, source: "Recommendation" }
      ];

      fields.forEach(f => {
        if (f.text) {
          f.text.toLowerCase().replace(/[.,!?;:]/g, " ").split(/\s+/).forEach(word => {
            allWords.push({ word, source: f.source });
          });
        }
      });
    });

    const filteredWords = allWords
      .map(w => {
        for (const [cat, words] of Object.entries(categories)) {
          if (words.includes(w.word)) return { ...w, category: cat };
        }
        return null;
      })
      .filter(Boolean);

    const freqMap = {};
    filteredWords.forEach(w => {
      const key = `${w.word}||${w.category}`;
      freqMap[key] = (freqMap[key] || 0) + 1;
    });

    const totalWords = filteredWords.length;

    let sortedWords = Object.keys(freqMap)
      .map(k => {
        const [word, category] = k.split("||");
        return {
          word,
          category,
          count: freqMap[k],
          percentage: ((freqMap[k] / totalWords) * 100).toFixed(1)
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    sortedWords = sortedWords.map((w, i) => {
      let level = "Low";
      if (i === 0) level = "High";
      else if (i <= 2) level = "Medium";
      return { ...w, rank: i + 1, level };
    });

    res.json({ success: true, issues: sortedWords });

  } catch (err) {
    console.error("Error in getTopCustomerIssues:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
export const getWeeklyRatingTrends = async (req, res) => {
  try {
    const filters = await buildFilters(req.query);
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date();

    const start = new Date(dateFrom);
    const end = new Date(dateTo);

    const agg = await Feedback.aggregate([
      { $match: { ...filters, createdAt: { $gte: start, $lte: end } } },
      { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
      { $unwind: "$rating" },
      { $addFields: {
          localDate: { $dateAdd: { startDate: "$createdAt", unit: "hour", amount: 8 } },
          numericValues: [
            "$rating.overallExperience",
            "$rating.foodQuality",
            "$rating.ambiance",
            "$rating.service",
            "$rating.valueForMoney",
            "$rating.staffAttitude",
            "$rating.bartenderAttitude"
          ]
        }
      },
      { $addFields: {
          avgFeedback: {
            $avg: {
              $filter: {
                input: "$numericValues",
                cond: { $ne: ["$$this", null] }
              }
            }
          }
        }
      },
      { $group: {
          _id: { year: { $year: "$localDate" }, month: { $month: "$localDate" }, week: { $isoWeek: "$localDate" } },
          avgRating: { $avg: "$avgFeedback" },
          totalFeedback: { $sum: 1 }
      }},
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } }
    ]);

    const weeks = [];
    const curr = new Date(start);
    while (curr <= end) {
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const weekNum = getISOWeek(curr);

      const existing = agg.find(a => a._id.year === year && a._id.month - 1 === month && a._id.week === weekNum);
      const weekStart = startOfISOWeek(curr);
      const weekEnd = endOfISOWeek(curr);

      weeks.push({
        weekLabel: `Week ${weeks.filter(w => w.weekLabel.includes(new Date(curr).toLocaleString('default', { month: 'short' }))).length + 1} (${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()})`,
        avgRating: existing ? parseFloat(existing.avgRating.toFixed(2)) : 0,
        totalFeedback: existing ? existing.totalFeedback : 0
      });

      curr.setDate(curr.getDate() + 7);
    }

    res.json({ data: weeks });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

function getISOWeek(date) {
  const d = new Date(date);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(),0,4);
  const diff = (d - firstThursday) / 86400000;
  return 1 + Math.floor(diff / 7);
}

function startOfISOWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfISOWeek(date) {
  const start = startOfISOWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}
export const getSatisfactionHeatmap = async (req, res) => {
  try {
    const { startDate, endDate, category, customerType } = req.query;

    let filters = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filters.createdAt = { $gte: start, $lte: end };
    }

    if (category) filters.category = category;
    if (customerType) {
      const typeMap = { "Dine-In": "Dine-in", "Take-Out": "Take-out", Delivery: "Delivery" };
      filters.customerType = typeMap[customerType] || customerType;
    }

    const agg = await Feedback.aggregate([
      { $match: filters },
      { $addFields: { ratingObjId: { $toObjectId: "$ratingID" } } },
      {
        $lookup: {
          from: "ratings",
          localField: "ratingObjId",
          foreignField: "_id",
          as: "rating",
        },
      },
      { $unwind: { path: "$rating", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          dayOfWeek: { $dayOfWeek: "$createdAt" },
          hour: { $hour: "$createdAt" },
          rating: { $ifNull: ["$rating.overallExperience", 0] },
        },
      },
      {
        $addFields: {
          period: {
            $switch: {
              branches: [
                { case: { $lt: ["$hour", 12] }, then: "Morning" },
                { case: { $lt: ["$hour", 17] }, then: "Afternoon" },
                { case: { $lt: ["$hour", 24] }, then: "Evening" },
              ],
              default: "Unknown",
            },
          },
        },
      },
      {
        $group: {
          _id: { dayOfWeek: "$dayOfWeek", period: "$period" },
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          day: {
            $arrayElemAt: [
              ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
              { $subtract: ["$_id.dayOfWeek", 1] },
            ],
          },
          period: "$_id.period",
          avgRating: { $round: ["$avgRating", 2] },
          count: 1,
          _id: 0,
        },
      },
    ]);

    const heatmapData = {};
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const periods = ["Morning", "Afternoon", "Evening"];

    days.forEach((day) => {
      periods.forEach((period) => {
        const found = agg.find((a) => a.day === day && a.period === period);
        heatmapData[`${day}-${period}`] = {
          avgRating: found ? found.avgRating : 0,
          totalFeedback: found ? found.count : 0,
        };
      });
    });

    res.render("analytics/AnalyticsAdmin", {
      heatmapData,
      query: req.query || {},
    });
  } catch (err) {
    console.error("Error generating heatmap:", err);
    res.status(500).send("Server Error");
  }
};

export const getSatisfactionHeatmapData = async (req, res) => {
  try {
    const { startDate, endDate, category, customerType } = req.query;
    console.log("Query params:", req.query);

    const now = new Date();
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const dayOfWeek = now.getDay(); 
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start = new Date(now);
      start.setDate(now.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    }

    console.log("Date range:", start, "to", end);

    const filters = { createdAt: { $gte: start, $lte: end } };
    if (category) filters.category = category;
    if (customerType) filters.customerType = customerType;

    console.log("Filters applied:", filters);

    const agg = await Feedback.aggregate([
      { $match: filters },
      { $addFields: { ratingObjId: { $toObjectId: "$ratingID" } } },
      {
        $lookup: {
          from: "ratings",
          localField: "ratingObjId",
          foreignField: "_id",
          as: "rating"
        }
      },
      { $unwind: { path: "$rating", preserveNullAndEmptyArrays: true } },

      {
        $addFields: {
          createdAtLocal: { $add: ["$createdAt", 1000 * 60 * 60 * 8] } 
        }
      },

      {
        $project: {
          dayOfWeek: { $dayOfWeek: "$createdAtLocal" },
          hour: { $hour: "$createdAtLocal" },
          rating: { $ifNull: ["$rating.overallExperience", 0] }
        }
      },

      {
        $addFields: {
          dayIndex: { $mod: [{ $add: ["$dayOfWeek", 5] }, 7] } 
        }
      },

      {
        $addFields: {
          dayName: {
            $arrayElemAt: [
              ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
              "$dayIndex"
            ]
          },
          period: {
            $switch: {
              branches: [
                { case: { $lt: ["$hour", 12] }, then: "Morning" },
                { case: { $lt: ["$hour", 17] }, then: "Afternoon" },
                { case: { $lt: ["$hour", 24] }, then: "Evening" }
              ],
              default: "Unknown"
            }
          }
        }
      },

      {
        $group: {
          _id: { dayName: "$dayName", period: "$period" },
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      },

      {
        $project: {
          day: "$_id.dayName",
          period: "$_id.period",
          avgRating: { $round: ["$avgRating", 2] },
          count: 1,
          _id: 0
        }
      }
    ]);

    console.log("Aggregation result:", agg);

    const heatmapData = {};
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const periods = ["Morning","Afternoon","Evening"];

    days.forEach(day => {
      periods.forEach(period => {
        const found = agg.find(a => a.day === day && a.period === period);
        heatmapData[`${day}-${period}`] = {
          avgRating: found ? found.avgRating : 0,
          totalFeedback: found ? found.count : 0
        };
      });
    });

    console.log("Final heatmapData:", heatmapData);

    res.json({ success: true, heatmapData });
  } catch (err) {
    console.error("Error generating heatmap JSON:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};


export const getPerformanceAndRatingReport = async (req, res) => {
  try {
    const { dateFrom, dateTo, customerType } = req.query;

    const startDate = dateFrom ? new Date(dateFrom) : null;
    const endDate = dateTo ? new Date(dateTo + "T23:59:59.999Z") : null;


    const matchFilter = {};
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = startDate;
      if (endDate) matchFilter.createdAt.$lte = endDate;
    }
    if (customerType) matchFilter.customerType = customerType;


    const agg = await Feedback.aggregate([
      { $match: matchFilter },
      { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
      { $unwind: "$rating" }, 
      { $project: {
          overallExperience: "$rating.overallExperience",
          foodQuality: "$rating.foodQuality",
          ambiance: "$rating.ambiance",
          service: "$rating.service",
          valueForMoney: "$rating.valueForMoney",
          staffAttitude: "$rating.staffAttitude",
          bartenderAttitude: "$rating.bartenderAttitude"
      } }
    ]);

    if (!agg.length) {
      return res.json({ success: true, categoryPerformance: [], ratingDistribution: [] });
    }


    const categories = [
      "Overall Experience",
      "Food Quality",
      "Ambiance",
      "Service",
      "Value For Money",
      "Staff Attitude",
      "Bartender Attitude"
    ];

    const categoryPerformance = categories.map(cat => {
      const ratings = agg
        .map(f => f[camelCase(cat)])
        .filter(n => n !== undefined);

      if (!ratings.length) return { category: cat, avgRating: 0, feedbackCount: 0 };

      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      return { category: cat, avgRating: parseFloat(avgRating.toFixed(2)), feedbackCount: ratings.length };
    });


    const allRatings = agg.flatMap(f =>
      categories.map(cat => f[camelCase(cat)])
    ).filter(n => n !== undefined);

    const ratingDistribution = [1, 2, 3, 4, 5].map(r => {
      const count = allRatings.filter(x => x === r).length;
      const percentage = allRatings.length ? ((count / allRatings.length) * 100).toFixed(1) : 0;
      return { rating: r, count, percentage: parseFloat(percentage) };
    });

    res.json({ success: true, categoryPerformance, ratingDistribution });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};


function camelCase(str) {
  return str
    .replace(/\s(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/\s/g, "")
    .replace(/^(.)/, (_, chr) => chr.toLowerCase());
}


export const getCorrelationReport = async (req, res) => {
  try {
    const ratings = await Rating.find();

    if (!ratings.length)
      return res.json({ success: false, message: "No ratings found" });


    const categories = [
      { key: "foodQuality", name: "Food Quality" },
      { key: "ambiance", name: "Ambiance" },
      { key: "service", name: "Service" },
      { key: "valueForMoney", name: "Value For Money" },
      { key: "staffAttitude", name: "Staff Attitude" },
      { key: "bartenderAttitude", name: "Bartender Attitude" }
    ];

    const correlations = categories.map(cat => {
      const valid = ratings.filter(r =>
        r.overallExperience != null && r[cat.key] != null
      );

      const n = valid.length;
      if (n === 0) return { category: cat.name, correlation: 0 };

      const x = valid.map(r => r[cat.key]);
      const y = valid.map(r => r.overallExperience);

      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = y.reduce((a, b) => a + b, 0) / n;

      const numerator = x.reduce(
        (sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY),
        0
      );
      const denomX = Math.sqrt(
        x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0)
      );
      const denomY = Math.sqrt(
        y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0)
      );

      const correlation = denomX && denomY ? numerator / (denomX * denomY) : 0;

      return {
        category: cat.name,
        correlation: parseFloat(correlation.toFixed(2))
      };
    });

    res.json({
      success: true,
      correlations
    });
  } catch (err) {
    console.error("Error generating correlation report:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getStatisticsSummary = async (req, res) => {
  try {
    const ratings = await Rating.find();
    if (!ratings.length) return res.json({ message: "No rating data found" });

    const categories = [
      "overallExperience",
      "foodQuality",
      "ambiance",
      "service",
      "valueForMoney",
      "staffAttitude",
      "bartenderAttitude"
    ];

    const allValues = [];
    categories.forEach(field => {
      ratings.forEach(r => {
        if (r[field] !== undefined && !isNaN(r[field])) allValues.push(r[field]);
      });
    });

    const n = allValues.length;
    if (n === 0) return res.json({ message: "No valid rating values found" });

    const mean = allValues.reduce((a, b) => a + b, 0) / n;
    const sorted = [...allValues].sort((a, b) => a - b);
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

    const frequency = {};
    allValues.forEach(v => frequency[v] = (frequency[v] || 0) + 1);
    let mode = allValues[0];
    let maxFreq = 0;
    for (const [val, freq] of Object.entries(frequency)) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mode = Number(val);
      }
    }

    const variance = allValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const confidenceLevel = 95;
    const z = 1.96;
    const marginOfError = z * stdDev / Math.sqrt(n);

    const sampleSize = await Customer.countDocuments();

    const responseRate = Math.round((ratings.length / sampleSize) * 100);

    const insights = [];
    if (mean >= 4.5) insights.push({ text: "Excellent satisfaction level observed", color: "green" });
    else if (mean >= 4) insights.push({ text: "High customer satisfaction with consistent ratings", color: "green" });
    else if (mean >= 3.5) insights.push({ text: "Moderate satisfaction — improvement opportunities exist", color: "orange" });
    else insights.push({ text: "Low satisfaction detected — urgent improvement needed", color: "red" });

    if (stdDev < 1) insights.push({ text: "Stable and reliable feedback trends", color: "green" });
    else insights.push({ text: "Varied responses indicate mixed experiences", color: "orange" });

    insights.push({ text: `Confidence level of ${confidenceLevel}% ensures strong data reliability`, color: "blue" });
    insights.push({ text: `Response rate is ${responseRate}% of total customers`, color: "purple" });

    res.json({
      mean,
      median,
      mode,
      stdDev,
      confidenceLevel,
      sampleSize,
      marginOfError,
      responseRate,
      insights
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute statistics" });
  }
};

export const getMostCommonNegativeIssues = async (req, res) => {
  try {
    const feedbacks = await Feedback.find({}).populate("ratingID");
    if (!feedbacks.length) return res.json({ success: true, issues: [] });


    let textData = [];
    feedbacks.forEach(fb => {
      const r = fb.ratingID;
      if (!r) return;
      [
        fb.message,
        r.overallExperienceReason,
        r.foodQualityReason,
        r.ambianceReason,
        r.serviceReason,
        r.valueForMoneyReason,
        r.staffAttitudeReason,
        r.bartenderAttitudeReason
      ].forEach(text => {
        if (text) textData.push(text.toLowerCase());
      });
    });


    let combinedText = textData.join(" ").replace(/[.,!?;:]/g, " ");


    const negativeWords = [
      // Food Quality
      "bad","bland","cold","stale","overcooked","undercooked","greasy","tasteless","unfresh","awful",
      "pangit","walang-lasa","malansa","hilaw","lutong-luma","masama","hindi-sariwa","madulas","masangsang","hindi-tama",
      // Ambiance
      "dull","noisy","uncomfortable","dark","crowded","dirty","chaotic","unpleasant","gloomy","bland",
      "malungkot","maingay","hindi-komportable","madilim","siksikan","marumi","magulo","hindi-kaaya-aya","nakakadismaya","walang-anyo",
      // Service
      "slow","rude","unfriendly","inattentive","inefficient","neglectful","careless","impolite","unhelpful","disrespectful",
      "mabagal","bastos","hindi-mabait","walang-pansin","hindi-epektibo","hindi-nakakaalaga","pabaya","hindi-magalang","walang-tulong","walang-respeto",
      // Value for Money
      "expensive","overpriced","wasteful","cheap-looking","not-worth","unfair","poor-quality","excessive","disappointing","inflated",
      "mahal","sobrang-mahal","sayang","murang-mura","hindi-sulit","hindi-makatarungan","mababa","sobra","nakakadismaya","pinagpapalaki",
      // Staff / Bartender Attitude
      "rude","unfriendly","impolite","cold","arrogant","careless","lazy","dismissive","disrespectful","unhelpful",
      "bastos","hindi-mabait","hindi-magalang","malamig","mayabang","pabaya","tamad","walang-pansin","walang-respeto","walang-tulong"
    ];

    const allWords = combinedText.split(/\s+/);
    const filteredWords = allWords.filter(w => negativeWords.includes(w));


    const freqMap = {};
    filteredWords.forEach(w => {
      freqMap[w] = (freqMap[w] || 0) + 1;
    });

    const totalWords = filteredWords.length;

    let sortedWords = Object.keys(freqMap)
      .map(word => ({
        word,
        count: freqMap[word],
        percentage: ((freqMap[word] / totalWords) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5


    sortedWords = sortedWords.map((w, i) => {
      let level = "Low";
      if (i === 0) level = "High";
      else if (i <= 2) level = "Medium";
      return { ...w, rank: i + 1, level };
    });

    res.json({ success: true, issues: sortedWords });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getIssueProgress = async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ ratingID: { $ne: null } }).populate("ratingID");

    if (!feedbacks.length) return res.json({ success: true, message: "No feedback yet." });

    const totalHours = feedbacks.reduce((sum, f) => {
      const created = new Date(f.createdAt);
      const ts = new Date(f.timestamp || f.createdAt);
      const diff = (ts - created) / 1000 / 60 / 60;
      return sum + Math.max(diff, 0);
    }, 0);
    const avgResponseTime = (totalHours / feedbacks.length).toFixed(1);
    const responseTarget = 2;
    const responseStatus = avgResponseTime <= responseTarget ? "On Target" : "Improving";


    const totalSatisfaction = feedbacks.reduce((sum, f) => sum + (f.ratingID?.overallExperience || 0), 0);
    const avgSatisfaction = ((totalSatisfaction / feedbacks.length) * 20).toFixed(0); 
    const satisfactionTarget = 90;
    const satisfactionStatus = avgSatisfaction >= satisfactionTarget ? "Excellent" : "Improving";


    const resolvedCount = feedbacks.filter(f => f.replies?.length > 0).length;
    const resolutionRate = ((resolvedCount / feedbacks.length) * 100).toFixed(0);
    const resolutionTarget = 80;
    const resolutionStatus = resolutionRate >= resolutionTarget ? "On Target" : "Improving";

    const negativeCount = feedbacks.filter(f => {
      const r = f.ratingID;
      return r && (r.overallExperience <= 2 || r.foodQuality <= 2 || r.service <= 2);
    }).length;
    const negativeRate = ((negativeCount / feedbacks.length) * 100).toFixed(0);
    const negativeTarget = 10;
    const negativeStatus = negativeRate <= negativeTarget ? "Good" : "Needs Attention";

    res.json({
      success: true,
      responseTime: avgResponseTime,
      responseTarget,
      responseStatus,
      customerSatisfaction: avgSatisfaction,
      satisfactionTarget,
      satisfactionStatus,
      resolutionRate,
      resolutionTarget,
      resolutionStatus,
      negativeRate,
      negativeTarget,
      negativeStatus
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getSegmentAnalysis = async (req, res) => {
  try {
    const filters = await buildFilters(req.query);
    const segmentData = await Feedback.aggregate([
      { $match: filters },
      { $lookup: { from: "ratings", localField: "ratingID", foreignField: "_id", as: "rating" } },
      { $unwind: "$rating" },
      { $group: { _id: "$customerType", avgRating: { $avg: "$rating.overallExperience" }, count: { $sum: 1 } } }
    ]);
    res.json(segmentData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const getPerformanceMetrics = async (req, res) => {
  try {
    const filters = await buildFilters(req.query);
    const totalFeedback = await Feedback.countDocuments(filters);
    const feedbacks = await Feedback.find(filters);

    const responded = feedbacks.filter(f => f.replies && f.replies.length > 0).length;
    const responseRate = totalFeedback ? (responded / totalFeedback) * 100 : 0;

    const totalResponseTime = feedbacks.reduce((sum, f) => {
      if (f.replies && f.replies.length > 0) {
        const firstReply = f.replies[0].createdAt;
        sum += ((new Date(firstReply) - new Date(f.createdAt)) / (1000 * 60));
      }
      return sum;
    }, 0);
    const avgResponseTime = responded ? totalResponseTime / responded : 0;

    res.json({
      responseRate: parseFloat(responseRate.toFixed(2)),
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
