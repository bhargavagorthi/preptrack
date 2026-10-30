// Progression for the Syllabus Journey.
//
// Clusters hold chapters along a path; inside a chapter the levels are its subtopics (a topic
// with no subtopics is a level on its own). Levels, chapters and clusters unlock in syllabus
// order as the student masters what comes before. It's guidance only: a student can open any
// level at any time ("jump in anyway"), and anything already practised counts as unlocked.
// Levels with no questions yet are "coming soon" and never block the chain.

const PROGRESSION = {
  chapterClearStars: 2,      // a chapter is "cleared" at 2 stars, which unlocks the next chapter
  clusterClearChapters: 1,   // a cluster unlocks the next cluster once this many of its chapters are cleared
  // Chapter (and topic) stars from the share of its playable levels mastered
  shareStars: [
    [1, 3],
    [2 / 3, 2],
    [1 / 3, 1],
  ],
};

// Level stars: started 1, practising 2, mastered 3 (needs work stays at 1)
function levelStars(l) {
  if (l.status === "mastered") return 3;
  if (l.status === "practising") return 2;
  if (l.attempted > 0) return 1;
  return 0;
}

function shareStars(share) {
  for (const [min, stars] of PROGRESSION.shareStars) if (share >= min - 1e-9) return stars;
  return 0;
}

const nameOf = (x) => x.name;
const lockState = (ruleOpen, touched, manual, id, open, early, locked) =>
  ruleOpen ? { state: "open" } : touched || manual.has(id) ? { state: "early", hint: early } : { state: "locked", hint: locked };

// Adds stars, lock state and an unlock hint to every cluster, chapter, topic and level.
// `manual` is the set of node ids the student opened early.
function applyProgression(subjects, manual) {
  for (const s of subjects) {
    let prevCluster = null;
    let starsEarned = 0;
    let starsTotal = 0;

    for (const w of s.clusters) {
      // ----- levels and chapters inside the cluster
      let prevChapter = null;
      for (const c of w.chapters) {
        const levels = c.topics.flatMap((t) => t.levels);
        let prevLevel = null;
        for (const l of levels) {
          l.stars = levelStars(l);
          if (!l.available) {
            l.lock = { state: "coming_soon", hint: "Questions for this are on the way" };
            continue;
          }
          l.lock = lockState(!prevLevel || prevLevel.status === "mastered", l.attempted > 0, manual, l.id, null,
            `Normally unlocks after mastering ${prevLevel?.name}`, `Master ${prevLevel?.name} to unlock`);
          prevLevel = l;
        }

        // Topics summarise their levels
        for (const t of c.topics) {
          const playable = t.levels.filter((l) => l.available > 0);
          t.playable_levels = playable.length;
          t.mastered_levels = playable.filter((l) => l.status === "mastered").length;
          t.stars = playable.length ? shareStars(t.mastered_levels / playable.length) : 0;
          t.lock = playable[0]?.lock || { state: "coming_soon", hint: "Questions for this topic are on the way" };
        }

        const playable = levels.filter((l) => l.available > 0);
        const mastered = playable.filter((l) => l.status === "mastered").length;
        c.playable_levels = playable.length;
        c.mastered_levels = mastered;
        // A chapter is playable if it has any questions (some may be tagged to the chapter itself)
        c.playable = c.available > 0;
        c.stars = playable.length ? shareStars(mastered / playable.length) : 0;
        c.cleared = c.stars >= PROGRESSION.chapterClearStars;
        if (!c.playable) {
          c.lock = { state: "coming_soon", hint: "Questions for this chapter are on the way" };
          continue;
        }
        starsEarned += c.stars;
        starsTotal += 3;
        c.lock = lockState(!prevChapter || prevChapter.cleared, levels.some((l) => l.attempted > 0), manual, c.id, null,
          `Normally unlocks after clearing ${nameOf(prevChapter || {})}`,
          `Earn ${PROGRESSION.chapterClearStars} stars in ${nameOf(prevChapter || {})} to unlock`);
        prevChapter = c;
      }

      // ----- the cluster itself
      const playableChapters = w.chapters.filter((c) => c.playable);
      w.cleared_chapters = playableChapters.filter((c) => c.cleared).length;
      w.playable_chapters = playableChapters.length;
      w.stars = playableChapters.reduce((n, c) => n + c.stars, 0);
      w.max_stars = playableChapters.length * 3;
      if (!playableChapters.length) {
        w.lock = { state: "coming_soon", hint: "Questions for this cluster are on the way" };
        continue;
      }
      const touched = playableChapters.some((c) => c.lock.state === "early" || c.topics.some((t) => t.levels.some((l) => l.attempted > 0)));
      w.lock = lockState(!prevCluster || prevCluster.cleared_chapters >= PROGRESSION.clusterClearChapters, touched, manual, w.id, null,
        `Normally unlocks after clearing a chapter in ${nameOf(prevCluster || {})}`,
        `Clear a chapter in ${nameOf(prevCluster || {})} to unlock`);
      // A cluster opened early opens its first chapter too
      if (w.lock.state !== "locked") {
        const first = playableChapters[0];
        if (first.lock.state === "locked") first.lock = { state: "open" };
      } else {
        // Chapters in a locked cluster are locked unless the student already went there
        for (const c of playableChapters) {
          if (c.lock.state === "open") c.lock = { state: "locked", hint: w.lock.hint };
        }
      }
      prevCluster = w;
    }
    s.stars = starsEarned;
    s.max_stars = starsTotal;

    // "You are here": the first unlocked, not-yet-cleared chapter
    let here = null;
    for (const w of s.clusters) {
      for (const c of w.chapters) {
        if (!here && c.playable && c.lock.state !== "locked" && !c.cleared) here = c.id;
      }
    }
    s.current_chapter_id = here;
  }
}

module.exports = { PROGRESSION, applyProgression, levelStars };
