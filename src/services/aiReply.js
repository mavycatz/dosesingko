import { spawn } from "child_process";

export const generateFeedbackReply = (message) => {
  return new Promise((resolve, reject) => {
    const py = spawn("python", ["generate_reply.py", message], { encoding: "utf-8" });

    let result = "";
    let error = "";

    py.stdout.setEncoding("utf8");
    py.stderr.setEncoding("utf8");

    py.stdout.on("data", (data) => { result += data; });
    py.stderr.on("data", (data) => { error += data; });

    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(error || `Exited with code ${code}`));
      resolve(result.trim());
    });
  });
};
