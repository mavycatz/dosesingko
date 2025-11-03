import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY.trim());

sgMail.send({
  to: "dosesingkoquezon@gmail.com",
  from: "dosesingkoquezon@gmail.com",
  subject: "Test SendGrid",
  text: "Hello!",
    mailSettings: { sandboxMode: { enable: true } }

})
.then(() => console.log("Email sent!"))
.catch(err => console.error(err.response ? err.response.body : err));
