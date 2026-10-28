// Game-style progression for the Syllabus Journey.
//
// Worlds (clusters), chapters and topics unlock in syllabus order as the student
// masters what comes before. It's guidance only: a student can open any level at
// any time ("jump in anyway"), and anything already practised counts as unlocked.
// Levels with no questions yet are "coming soon" and never block the chain.

const PROGRESSION = {
  chapterClearStars: 2,      // a chapter is "cleared" at 2 stars, which unlocks the next chapter
  worldClearChapters: 1,     // a world unlocks the next world once this many of its chapters are cleared
  // Chapter stars from the share of its playable topics mastered
  chapterStars: [
    [1, 3],
    [2 / 3, 2],
    [1 / 3, 1],
  ],
};

// Topic stars: started 1, practising 2, mastered 3 (needs work stays at 1)
function topicStars(t) {
  if (t.status === "mastered") return 3;
  if (t.status === "practising") return 2;
  if (t.attempted > 0) return 1;
  return 0;
}

function chapterStars(masteredShare) {
  for (const [min, stars] of PROGRESSION.chapterStars) if (masteredShare >= min - 1e-9) return stars;
  return 0;
}

const nameOf = (x) => x.name;

// Adds stars, lock state and an unlock hint to every world, chapter and topic.
// `manual` is the set of node ids the student opened early.
function applyProgression(subjects, manual) {
  for (const s of subjects) {
    let prevWorld = null;
    let starsEarned = 0;
    let starsTotal = 0;

    for (const w of s.clusters) {
      // ----- topics and chapters inside the world
      let prevChapter = null;
      for (const c of w.chapters) {
        let prevTopic = null;
        const playable = c.topics.filter((t) => t.available > 0);
        for (const t of c.topics) {
          t.stars = topicStars(t);
          if (!t.available) {
            t.lock = { state: "coming_soon", hint: "Questions for this topic are on the way" };
            continue;
          }
          const ruleOpen = !prevTopic || prevTopic.status === "mastered";
          const touched = t.attempted > 0;
          t.lock = ruleOpen
            ? { state: "open" }
            : touched || manual.has(t.id)
              ? { state: "early", hint: `Normally unlocks after mastering ${prevTopic.name}` }
              : { state: "locked", hint: `Master ${prevTopic.name} to unlock` };
          prevTopic = t;
        }

        const mastered = playable.filter((t) => t.status === "mastered").length;
        c.playable_topics = playable.length;
        // A chapter is playable if it has any questions (some may be tagged to the chapter itself)
        c.playable = c.available > 0;
        c.stars = playable.length ? chapterStars(mastered / playable.length) : 0;
        c.cleared = c.stars >= PROGRESSION.chapterClearStars;
        if (!c.playable) {
          c.lock = { state: "coming_soon", hint: "Questions for this chapter are on the way" };
          continue;
        }
        starsEarned += c.stars;
        starsTotal += 3;
        const ruleOpen = !prevChapter || prevChapter.cleared;
        const touched = c.topics.some((t) => t.attempted > 0);
        c.lock = ruleOpen
          ? { state: "open" }
          : touched || manual.has(c.id)
            ? { state: "early", hint: `Normally unlocks after clearing ${nameOf(prevChapter)}` }
            : { state: "locked", hint: `Earn ${PROGRESSION.chapterClearStars} stars in ${nameOf(prevChapter)} to unlock` };
        prevChapter = c;
      }

      // ----- the world itself
      const playableChapters = w.chapters.filter((c) => c.playable);
      w.cleared_chapters = playableChapters.filter((c) => c.cleared).length;
      w.playable_chapters = playableChapters.length;
      w.stars = playableChapters.reduce((n, c) => n + c.stars, 0);
      w.max_stars = playableChapters.length * 3;
      if (!playableChapters.length) {
        w.lock = { state: "coming_soon", hint: "Questions for this world are on the way" };
        continue;
      }
      const ruleOpen = !prevWorld || prevWorld.cleared_chapters >= PROGRESSION.worldClearChapters;
      const touched = playableChapters.some((c) => c.lock.state === "early" || c.topics.some((t) => t.attempted > 0));
      w.lock = ruleOpen
        ? { state: "open" }
        : touched || manual.has(w.id)
          ? { state: "early", hint: `Normally unlocks after clearing a chapter in ${nameOf(prevWorld)}` }
          : { state: "locked", hint: `Clear a chapter in ${nameOf(prevWorld)} to unlock` };
      // A world opened early opens its first chapter too
      if (w.lock.state !== "locked") {
        const first = playableChapters[0];
        if (first.lock.state === "locked") first.lock = { state: "open" };
      } else {
        // Chapters in a locked world are locked unless the student already went there
        for (const c of playableChapters) {
          if (c.lock.state === "open") c.lock = { state: "locked", hint: w.lock.hint };
        }
      }
      prevWorld = w;
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

module.exports = { PROGRESSION, applyProgression, topicStars };
