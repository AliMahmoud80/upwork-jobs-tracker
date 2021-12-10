const axios = require("axios");
const JsonDB = require("node-json-db").JsonDB;
const Config = require("node-json-db/dist/lib/JsonDBConfig.js").Config;
const notifier = require("node-notifier");
const moment = require("moment");

require("dotenv").config();

const db = new JsonDB(new Config("jobs_db.json", true, false, "/"));
const scriptStartDate = new Date().getTime();

const fetchInterval = process.env.FETCH_INTERVAL || 180;
const accessToken = process.env.MASTER_ACCESS_TOKEN;
const enableLogging = process.env.ENABLE_LOGGING || false;
const blockedKeywords = process.env.BLOCKED_KEYWORDS.split(",");

let allJobs = [];

const jobsLogTemplate = (title, url, time, budget, amount) => {
  return `
    ======================
    ${title}
    ${url}
    ${moment(time).fromNow()}
    Budget: ${budget || amount}
    ======================`;
};

/**
 * Filter old jobs and return new jobs only.
 *
 * @param {Array} jobs Array of jobs
 * @returns New jobs only
 */
function identifyNewJobs(jobs) {
  if (!allJobs.length == 0) {
    const latestFetchedJobTime = allJobs[0].createdOn; // most recent job in the old fetched jobs.
    const newJobs = jobs.filter((job) =>
      moment(job.createdOn).isAfter(latestFetchedJobTime)
    );

    return newJobs;
  } else {
    return jobs;
  }
}

/**
 * Remove jobs that contains one of the blocked keywords in title
 * or description.
 *
 * @param {Array} jobs Array of jobs
 * @returns array of filtered results
 */
function filterBlocked(jobs) {
  return jobs.filter((job) => {
    let clean = true;

    blockedKeywords.forEach((word) => {
      if (
        job.title.toLowerCase().includes(word) ||
        job.description.toLowerCase().includes(word)
      )
        clean = false;
    });

    return clean;
  });
}

/**
 * Save fetched jobs in the db.
 *
 * @param {Array} jobs Array of jobs
 */
function saveJobs(jobs) {
  jobs.forEach((job) => {
    db.push(`/jobs/${scriptStartDate}[]`, job, true);
  });
}

/**
 * Fire a notification for new jobs.
 *
 * @param {Array} jobs Array of jobs
 */
function fireJobsAlert(jobs) {
  notifier.notify({
    title: "Job Tracker",
    message: `New ${jobs.length} jobs available.`,
    sound: true,
  });
}

/**
 * Log new jobs to the terminal.
 *
 * @param {Array} jobs Array of jobs
 */
function logJobs(jobs) {
  console.log(
    "\n\x1b[42m===============================================\x1b[0m\n"
  );
  jobs
    .reverse()
    .forEach((job) =>
      console.log(
        jobsLogTemplate(
          job.title,
          `https://www.upwork.com/jobs/${job.ciphertext}`,
          job.createdOn,
          job.hourlyBudgetText,
          job.amount.amount + "$"
        )
      )
    );
}

function notifyStopped() {
  notifier.notify({
    title: "Job Tracker",
    message: "Tracker stopped",
    sound: true,
  });
}

const intervalRef = setInterval(fetchJobs, fetchInterval);

/**
 * Fetch jobs from upwork API.
 */
function fetchJobs() {
  return axios
    .get("https://www.upwork.com/ab/find-work/api/feeds/saved-searches?", {
      withCredentials: true,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        cookie: `master_access_token=${accessToken};`,
        referer: "https://www.upwork.com/nx/find-work/",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
      },
    })
    .then((res) => {
      let results = res.data.results;

      results = identifyNewJobs(results);
      results = filterBlocked(results);

      if (results.length == 0) return;

      allJobs = results.concat(allJobs);

      fireJobsAlert(results);

      // Save jobs in db if logging is enabled.
      if (enableLogging) saveJobs(results);

      logJobs(results);
    })
    .catch(async (err) => {
      console.error("\x1b[41mError while fetching jobs.\x1b[0m\n", err);

      if (err.response?.status === 401) {
        clearInterval(intervalRef);
        console.error(
          "\x1b[41mPlease provide a valid master_access_token.\x1b[0m\n"
        );
        notifyStopped();
      }
    });
}
