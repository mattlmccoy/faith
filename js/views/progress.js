/* ============================================================
   ABIDE - Reading Progress Dashboard
   66-book grid showing chapters read per book.
   ============================================================ */

const ProgressView = (() => {
  // All 66 books with their chapter counts
  const BIBLE_BOOKS = [
    // Old Testament
    { name: 'Genesis',        chapters: 50, testament: 'OT' },
    { name: 'Exodus',         chapters: 40, testament: 'OT' },
    { name: 'Leviticus',      chapters: 27, testament: 'OT' },
    { name: 'Numbers',        chapters: 36, testament: 'OT' },
    { name: 'Deuteronomy',    chapters: 34, testament: 'OT' },
    { name: 'Joshua',         chapters: 24, testament: 'OT' },
    { name: 'Judges',         chapters: 21, testament: 'OT' },
    { name: 'Ruth',           chapters: 4,  testament: 'OT' },
    { name: '1 Samuel',       chapters: 31, testament: 'OT' },
    { name: '2 Samuel',       chapters: 24, testament: 'OT' },
    { name: '1 Kings',        chapters: 22, testament: 'OT' },
    { name: '2 Kings',        chapters: 25, testament: 'OT' },
    { name: '1 Chronicles',   chapters: 29, testament: 'OT' },
    { name: '2 Chronicles',   chapters: 36, testament: 'OT' },
    { name: 'Ezra',           chapters: 10, testament: 'OT' },
    { name: 'Nehemiah',       chapters: 13, testament: 'OT' },
    { name: 'Esther',         chapters: 10, testament: 'OT' },
    { name: 'Job',            chapters: 42, testament: 'OT' },
    { name: 'Psalms',         chapters: 150, testament: 'OT' },
    { name: 'Proverbs',       chapters: 31, testament: 'OT' },
    { name: 'Ecclesiastes',   chapters: 12, testament: 'OT' },
    { name: 'Song of Solomon',chapters: 8,  testament: 'OT' },
    { name: 'Isaiah',         chapters: 66, testament: 'OT' },
    { name: 'Jeremiah',       chapters: 52, testament: 'OT' },
    { name: 'Lamentations',   chapters: 5,  testament: 'OT' },
    { name: 'Ezekiel',        chapters: 48, testament: 'OT' },
    { name: 'Daniel',         chapters: 12, testament: 'OT' },
    { name: 'Hosea',          chapters: 14, testament: 'OT' },
    { name: 'Joel',           chapters: 3,  testament: 'OT' },
    { name: 'Amos',           chapters: 9,  testament: 'OT' },
    { name: 'Obadiah',        chapters: 1,  testament: 'OT' },
    { name: 'Jonah',          chapters: 4,  testament: 'OT' },
    { name: 'Micah',          chapters: 7,  testament: 'OT' },
    { name: 'Nahum',          chapters: 3,  testament: 'OT' },
    { name: 'Habakkuk',       chapters: 3,  testament: 'OT' },
    { name: 'Zephaniah',      chapters: 3,  testament: 'OT' },
    { name: 'Haggai',         chapters: 2,  testament: 'OT' },
    { name: 'Zechariah',      chapters: 14, testament: 'OT' },
    { name: 'Malachi',        chapters: 4,  testament: 'OT' },
    // New Testament
    { name: 'Matthew',        chapters: 28, testament: 'NT' },
    { name: 'Mark',           chapters: 16, testament: 'NT' },
    { name: 'Luke',           chapters: 24, testament: 'NT' },
    { name: 'John',           chapters: 21, testament: 'NT' },
    { name: 'Acts',           chapters: 28, testament: 'NT' },
    { name: 'Romans',         chapters: 16, testament: 'NT' },
    { name: '1 Corinthians',  chapters: 16, testament: 'NT' },
    { name: '2 Corinthians',  chapters: 13, testament: 'NT' },
    { name: 'Galatians',      chapters: 6,  testament: 'NT' },
    { name: 'Ephesians',      chapters: 6,  testament: 'NT' },
    { name: 'Philippians',    chapters: 4,  testament: 'NT' },
    { name: 'Colossians',     chapters: 4,  testament: 'NT' },
    { name: '1 Thessalonians',chapters: 5,  testament: 'NT' },
    { name: '2 Thessalonians',chapters: 3,  testament: 'NT' },
    { name: '1 Timothy',      chapters: 6,  testament: 'NT' },
    { name: '2 Timothy',      chapters: 4,  testament: 'NT' },
    { name: 'Titus',          chapters: 3,  testament: 'NT' },
    { name: 'Philemon',       chapters: 1,  testament: 'NT' },
    { name: 'Hebrews',        chapters: 13, testament: 'NT' },
    { name: 'James',          chapters: 5,  testament: 'NT' },
    { name: '1 Peter',        chapters: 5,  testament: 'NT' },
    { name: '2 Peter',        chapters: 3,  testament: 'NT' },
    { name: '1 John',         chapters: 5,  testament: 'NT' },
    { name: '2 John',         chapters: 1,  testament: 'NT' },
    { name: '3 John',         chapters: 1,  testament: 'NT' },
    { name: 'Jude',           chapters: 1,  testament: 'NT' },
    { name: 'Revelation',     chapters: 22, testament: 'NT' },
  ];

  const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((s, b) => s + b.chapters, 0);

  function render(container) {
    Router.setTitle('Reading Progress');
    Router.clearHeaderActions();

    const progress = Store.getReadingProgress();

    // Tally totals
    let totalRead = 0;
    let booksComplete = 0;
    BIBLE_BOOKS.forEach(b => {
      const read = (progress[b.name] || []).length;
      totalRead += read;
      if (read >= b.chapters) booksComplete++;
    });
    const pct = Math.round((totalRead / TOTAL_CHAPTERS) * 100);

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      <!-- Summary ring -->
      <div class="progress-summary">
        <div class="progress-ring-wrap">
          <svg class="progress-ring" width="88" height="88" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="36" fill="none" stroke="var(--divider)" stroke-width="7"/>
            <circle cx="44" cy="44" r="36" fill="none" stroke="var(--color-primary)" stroke-width="7"
              stroke-linecap="round"
              stroke-dasharray="${Math.round(2 * Math.PI * 36)}"
              stroke-dashoffset="${Math.round(2 * Math.PI * 36 * (1 - pct / 100))}"
              transform="rotate(-90 44 44)"/>
          </svg>
          <div class="progress-ring-label">
            <span class="progress-ring-pct">${pct}%</span>
          </div>
        </div>
        <div class="progress-summary-stats">
          <div class="progress-stat">
            <span class="progress-stat__val">${totalRead.toLocaleString()}</span>
            <span class="progress-stat__label">chapters read</span>
          </div>
          <div class="progress-stat">
            <span class="progress-stat__val">${booksComplete}</span>
            <span class="progress-stat__label">books complete</span>
          </div>
          <div class="progress-stat">
            <span class="progress-stat__val">${TOTAL_CHAPTERS - totalRead}</span>
            <span class="progress-stat__label">chapters left</span>
          </div>
        </div>
      </div>

      <!-- OT -->
      <div class="section-header" style="margin-top:var(--space-2);">
        <span class="section-title">Old Testament</span>
      </div>
      <div class="progress-book-grid">
        ${BIBLE_BOOKS.filter(b => b.testament === 'OT').map(b => _bookCard(b, progress[b.name] || [])).join('')}
      </div>

      <!-- NT -->
      <div class="section-header" style="margin-top:var(--space-4);">
        <span class="section-title">New Testament</span>
      </div>
      <div class="progress-book-grid">
        ${BIBLE_BOOKS.filter(b => b.testament === 'NT').map(b => _bookCard(b, progress[b.name] || [])).join('')}
      </div>

      <p class="text-xs text-muted" style="text-align:center;margin:var(--space-5) 0 var(--space-6);">
        Progress is tracked automatically when you read chapters in Scripture view.
      </p>
    `;

    container.innerHTML = '';
    container.appendChild(div);
  }

  function _bookCard(book, readChapters) {
    const readCount = readChapters.length;
    const pct = Math.min(100, Math.round((readCount / book.chapters) * 100));
    const complete = readCount >= book.chapters;
    const started = readCount > 0;

    return `
      <div class="progress-book-card${complete ? ' progress-book-card--complete' : started ? ' progress-book-card--started' : ''}"
           title="${book.name}: ${readCount} of ${book.chapters} chapter${book.chapters !== 1 ? 's' : ''} read"
           onclick="ScriptureView.loadPassage('${book.name} 1');Router.navigate('/scripture');">
        <div class="progress-book-name">${_shortName(book.name)}</div>
        <div class="progress-book-bar">
          <div class="progress-book-bar__fill" style="width:${pct}%"></div>
        </div>
        ${complete ? '<div class="progress-book-check">✓</div>' : ''}
      </div>`;
  }

  function _shortName(name) {
    // Abbreviate long names
    const abbrevs = {
      'Genesis': 'Gen', 'Exodus': 'Exod', 'Leviticus': 'Lev', 'Numbers': 'Num',
      'Deuteronomy': 'Deut', 'Joshua': 'Josh', 'Judges': 'Judg',
      '1 Samuel': '1Sam', '2 Samuel': '2Sam', '1 Kings': '1Kgs', '2 Kings': '2Kgs',
      '1 Chronicles': '1Chr', '2 Chronicles': '2Chr', 'Nehemiah': 'Neh', 'Esther': 'Est',
      'Psalms': 'Ps', 'Proverbs': 'Prov', 'Ecclesiastes': 'Eccl',
      'Song of Solomon': 'Song', 'Isaiah': 'Isa', 'Jeremiah': 'Jer',
      'Lamentations': 'Lam', 'Ezekiel': 'Ezek', 'Daniel': 'Dan',
      'Hosea': 'Hos', 'Obadiah': 'Obad', 'Habakkuk': 'Hab',
      'Zephaniah': 'Zeph', 'Zechariah': 'Zech', 'Malachi': 'Mal',
      'Matthew': 'Matt', 'Romans': 'Rom',
      '1 Corinthians': '1Cor', '2 Corinthians': '2Cor', 'Galatians': 'Gal',
      'Ephesians': 'Eph', 'Philippians': 'Phil', 'Colossians': 'Col',
      '1 Thessalonians': '1Th', '2 Thessalonians': '2Th',
      '1 Timothy': '1Tim', '2 Timothy': '2Tim',
      'Philemon': 'Phm', 'Hebrews': 'Heb',
      'Revelation': 'Rev',
    };
    return abbrevs[name] || name;
  }

  return { render };
})();

window.ProgressView = ProgressView;
