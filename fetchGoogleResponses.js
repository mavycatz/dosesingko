import { google } from "googleapis";
import Feedback from "./src/models/FeedbackModel.js";
import Customer from "./src/models/Customer.js";
import Menu from "./src/models/Menu.js";
import Rating from "./src/models/Rating.js";
import fs from "fs";
import path from "path";

const SPREADSHEET_ID = "1XMz5zlHjZTIz2nQJ7fO-Us9O_EdXGiOaz5rfDIucxCk"; 
const RANGE = "Form Responses 1!A:Z";

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), "service-account.json");
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  throw new Error("Google service-account.json file not found!");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

export async function fetchResponses() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    const rows = res.data.values;
    if (!rows || rows.length < 2) {
      console.log("No new responses found.");
      return;
    }

    const headers = rows[0];
    const responses = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => obj[header] = row[i] || "");
      return obj;
    });

    for (const r of responses) {
      const orNumberValue = r["Your OR number:"]?.trim();
      if (!orNumberValue) {
        console.log("Skipping row without OR number:", r);
        continue;
      }

      // Skip if feedback already exists for this OR number
      const existingFeedback = await Feedback.findOne({ orNumber: orNumberValue });
      if (existingFeedback) {
        console.log(`Skipping OR number ${orNumberValue}, already in database.`);
        continue;
      }

      // Get or create Customer
      let customer = await Customer.findOne({ orNumber: orNumberValue });
      if (!customer) customer = await Customer.create({ orNumber: orNumberValue });

      const customerName = r["Name(Optional):"] || "Anonymous";
      const customerEmail = r["Email(Optional):"] || r["Email Address"] || "";
      const message = r["Message:"] || "";
      const customerType = r["Customer Type:"] || "Dine-in";
      const timestamp = r["Timestamp"] || new Date().toISOString();

      // Map Menu items
      let menus = [];
      const menuColumns = ["What did you order?", "What did you order?"];
      menuColumns.forEach(col => {
        if (r[col]) menus.push(...r[col].split(",").map(m => m.trim()));
      });
      const menuID = menus.length
        ? (await Menu.find({ itemName: { $in: menus } }).select("_id")).map(m => m._id)
        : [];

      // Map recommendToOthers
      let recommend = r["Recommend to Others:"]?.trim();
      if (recommend === "Yes, definitely") recommend = "yes";
      else if (recommend === "Maybe or Not sure") recommend = "maybe";
      else if (recommend === "No, I wouldn't") recommend = "no";
      else recommend = undefined;

      // Create Rating if any rating exists
      let ratingID = null;
      if (r["Overall Experience:"] || r["Food Quality:"] || r["Ambiance:"] || r["Service:"]) {
        const ratingDoc = await Rating.create({
          overallExperience: Number(r["Overall Experience:"]) || 0,
          overallExperienceReason: "",
          foodQuality: Number(r["Food Quality:"]) || 0,
          foodQualityReason: "",
          ambiance: Number(r["Ambiance:"]) || 0,
          ambianceReason: "",
          service: Number(r["Service:"]) || 0,
          serviceReason: "",
          valueForMoney: Number(r["Value for Money:"]) || 0,
          valueForMoneyReason: "",
          staffAttitude: Number(r["Staff Attitude:"]) || 0,
          staffAttitudeReason: "",
          bartenderAttitude: Number(r["Bartender Attitude"]) || 0,
          bartenderAttitudeReason: "",
          recommendToOthers: recommend,
          recommendToOthersReason: ""
        });
        ratingID = ratingDoc._id;
      }

      const feedbackData = {
        customer: customer._id,
        customerName,
        customerEmail,
        orNumber: orNumberValue,
        message,
        customerType,
        menuID,
        ratingID,
        timestamp
      };

      await Feedback.create(feedbackData);
      console.log(`Saved feedback for OR number ${orNumberValue}`);
    }

    console.log(`${responses.length} responses processed.`);

  } catch (error) {
    console.error("Error fetching responses:", error);
  }
}

// Run immediately and every 1 minute
fetchResponses();
setInterval(fetchResponses, 60 * 1000);
