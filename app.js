import "dotenv/config";
import fetch from "node-fetch";
import dateFns from "date-fns";
import alert from "alert";

const TOKEN = process.env.MASTER_ACCESS_TOKEN;
const FETCH_INTERVAL = process.env.FETCH_INTERVAL * 1000;
const BLOCKED_KEYWORDS = process.env.BLOCKED_KEYWORDS;

let latestJobTime = new Date(0);

async function fetchJobs() {
  try {
    let res = await fetch(
      "https://www.upwork.com/ab/find-work/api/feeds/saved-searches?",
      {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          cookie: `master_access_token=${TOKEN};`,
          referer: "https://www.upwork.com/nx/find-work/",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
        },
      }
    );

    if (res.status === 401) throw new Error("Invalid master_access_token");

    res = await res.json();

    return res.results;
  } catch (e) {
    throw e;
  }
}

/**
 * Sets the time of the latest job
 *
 *
 * @param {String} time string representation of time
 */

function setLatestJobTime(time) {
  latestJobTime = new Date(time);
}

/**
 * Identifies the new jobs coming from fetch result
 *
 *
 * @param {Array} jobs Array of jobs
 * @returns {Array} array of new jobs
 */

function identifyNewJobs(jobs) {
  const newJobs = jobs.filter((job) => {
    if (dateFns.isAfter(dateFns.parseISO(job.publishedOn), latestJobTime))
      return true;
  });

  if (newJobs.length > 0) {
    setLatestJobTime(newJobs[0].publishedOn);
  }

  return newJobs;
}

/**
 * Remove jobs that contains one of the blocked keywords in title
 * or description.
 *
 * @param {Array} jobs Array of jobs
 * @returns array of filtered results
 */

function filterBlocked(jobs) {
  let arrayOfKeywords = BLOCKED_KEYWORDS.split(",");

  const checker = (job) => {
    return !arrayOfKeywords.some(
      (keyword) =>
        job.title.toLowerCase().includes(keyword) ||
        job.description.toLowerCase().includes(keyword)
    );
  };

  return jobs.filter(checker);
}

/**
 * converts a job to a redable representation for logging
 *
 *
 * @param {Array} jobs Array of jobs
 * @returns {String} a string representation for the job
 */

const jobsLogTemplate = (job) => {
  const jobURL = "https://www.upwork.com/jobs/" + job.ciphertext;
  return `
    ======================
    ${job.title}
    Description: ${job.description.slice(0, 50)}...
    ${jobURL}
    ${dateFns.formatDistanceToNow(dateFns.parseISO(job.publishedOn), {
      addSuffix: true,
    })}
    Budget: ${job.hourlyBudgetText || job.amount.amount + "$"}
    ======================`;
};

/**
 * Logs the jobs in the console so user can see new jobs
 *
 * @param {Array} jobs Array of jobs
 */

function logJobs(jobs) {
  if (jobs.length) {
    console.log(
      "\n\x1b========================================================\x1b[0m\n"
    );

    jobs.reverse().forEach((job) => {
      console.log(jobsLogTemplate(job));
    });

    console.log(
      "\n\x1b========================================================\x1b[0m\n"
    );
  }
}

/**
 * alerts the number of new jobs found
 *
 * @param {number} length
 */

function alertNewJobs(length) {
  alert("New " + length + " jobs found");
}

async function main() {
  try {
    const jobs = await fetchJobs();
    const newJobs = identifyNewJobs(jobs);
    const filteredJobs = filterBlocked(newJobs);

    if (filteredJobs.length > 0) {
      logJobs(filteredJobs);
      alertNewJobs(filteredJobs.length);
    }

    setTimeout(main, FETCH_INTERVAL);
  } catch (e) {
    console.error(e);
  }
}

main();
