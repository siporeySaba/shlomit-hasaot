# שומרי התחנה · שלומית

שיבוץ ודיווח של הורים מתנדבים בתחנת ההסעות בשלומית, כל בוקר 7:20–7:40.

## הרצה מקומית
מתוך `C:\claude_code`: השרת `shlomit-hasaot` ב-`.claude/launch.json` (פורט 5192), או `node .claude/serve.js shlomit-hasaot 5192`.

## מבנה
- `index.html`: מעטפת, לוגו במסילה הימנית (בטלפון: כותרת עליונה וניווט תחתון)
- `js/app.js`: מסכים: השבוע (הורים), לוח ודיווח, ניהול (דיווחים + ייצוא CSV, מתנדבים, הגרלת סבב)
- `js/scheduler.js`: הגרלה עם "מספר הגרלה" (ניתנת לשחזור), 1 או 2 פתקים למתנדב, בלי חזרה בתוך 5 ימים
- `js/store.js`: שכבת נתונים. **שלב 1: localStorage עם נתוני דוגמה.** שלב 2: Firestore באותו ממשק

## מודל נתונים (גם ל-Firestore)
- `volunteers/{id}`: name, capacity (1/2), active. **הטלפון יישמר בנפרד** ב-`contacts/{id}` (קריאה למנהל בלבד)
- `assignments/{date}`: volunteerId, originalId (אם הוחלף), swappedAt, roundId
- `reports/{date}`: reporterId, buses (1–6), ok, details, createdAt, updatedAt
- `rounds/{id}`: seed, start, end

## תזכורות (לפי ההחלפות)
- שבוע לפני: למי שמשובץ, רק אם לא הוחלף (`originalId` ריק)
- ערב לפני: למי שמשובץ כרגע (כולל מחליף)

## הקמת Firebase (פעם אחת)
1. console.firebase.google.com ← פרויקט חדש `shlomit-hasaot` (תוכנית Spark החינמית, בלי Analytics)
2. Build ← Firestore Database ← Create (אזור eur3 / europe-west) ← Production mode
3. Rules ← להדביק את `firestore.rules` ← Publish
4. Build ← Authentication ← Get started ← Google ← Enable. ב-Settings ← Authorized domains להוסיף `siporeysaba.github.io`
5. Project settings ← Your apps ← Web (</>) ← להעתיק את ה-firebaseConfig ל-`js/config.js`
6. להיכנס לאתר ← ניהול ← התחברות עם Google. יופיע מזהה (UID). בקונסול: Firestore ← אוסף `admins` ← מסמך עם המזהה הזה (שדה כלשהו, למשל `name`)
7. לרענן: נוצר אוטומטית מפתח יישוב. "העתקת קישור להורים" ← לשלוח בקבוצה
