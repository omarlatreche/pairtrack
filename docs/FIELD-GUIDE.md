# PairTrack — field guide

For the engineer, not the developer. One page.

---

## Monday morning

1. Open **PairTrack** from the home screen icon.
2. Type your passphrase. It takes about a second to unlock — that is the encryption
   working, not the app being slow.
3. **Import** → choose the week's spreadsheet.
4. Check the columns it detected, tap **Continue**, read the summary, tap **Import**.
5. **Take a backup straight away**: Export → Encrypted backup. Email it to yourself.

The file is read on the phone. Nothing is uploaded — there is nowhere to upload it to.

## At the frame

The list is already in **frame walk order**: frame, then block, then pair number. That is
the order you walk it, not the order the office typed it.

| To do this | Do this |
|---|---|
| Pass the current stage | Tap the **green tick** |
| Fail it | Tap the **red cross**, then pick a reason |
| Undo | Tap **Undo** in the bar that appears — you have 6 seconds |
| See everything about a job | Tap the card body |
| Find a job the office is asking about | Type the **circuit number** in the search box |

**One tap does one stage.** Tap the tick again on the same job to move it through *Test*,
and again for *Completed*. The timestamps write themselves.

After you mark a job, the next one moves up to the top. You should never have to hunt for
your place.

### The tick moves through three stages

```
Ready to activate  →  Test  →  Completed
```

The button always applies to whichever stage that job is on. The status chip tells you
where it is, in words as well as colour.

## Working a filter

Tap **Outstanding** and the jobs you have done drop out of the list as you go, so the next
one is always under your thumb.

Other filters worth knowing:

- **E/D-side** — the 222 jobs with ties. They take longer. Useful for planning a day.
- **No ties** — the shorter ones.
- **Frame 09** — the INTL block, physically elsewhere on site.
- **Needs attention** — rows where the spreadsheet itself was wrong. You can correct the
  value on the job and it goes back into proper walk order.

## Sorting and grouping

**Sort** (bottom left) → pick a field, and Ascending or Descending. It sticks between
sessions.

**Group by frame / block** puts a sticky header on each block with a done/total count.
Block sizes run from 5 to 58 jobs, so the counts help you pace the day.

**Group by old shelf** if you would rather recover one shelf at a time.

## Bright sunlight

Tap the **sun icon** in the header. Near-black on white, heavier text, no thin lines.
Tap the moon to go back.

## Friday, or whenever the office wants it

**Export** →

- **Encrypted backup (.ptbak)** — safe to email or keep in iCloud. Only your passphrase
  opens it. This is what gets your work back if you lose the phone.
- **Spreadsheet (.xlsx)** — for the office. Same columns as the pack you were sent, with
  your progress added on the end.

> The spreadsheet is **not** encrypted, and it contains every customer's telephone number.
> Send it to the office only, and delete it off the phone afterwards. The app warns you
> before it makes one.

## Things worth knowing

**It locks itself.** After 15 minutes untouched, or 5 minutes in your pocket. Change the
timeout in Settings. There is also a lock button in the header, always.

**There is no password reset.** None. If you forget the passphrase, nobody can get the
data back — not you, not whoever wrote this. Write it down somewhere safe and take
backups.

**It works with no signal, always.** Aeroplane mode, a basement, a chamber in the rain —
it makes no difference. It never needed a connection in the first place.

**There is no server, and nothing syncs.** This one catches people out, so it is worth
being blunt about:

- Your jobs live on **this phone only**. Not in an account, not in a cloud, nowhere else.
- Changing your passphrase changes it **on this phone**. It does not travel anywhere,
  because there is nowhere for it to travel to.
- Install PairTrack on a second phone and you get a **blank, separate** app. It will not
  see your jobs.
- **The encrypted backup is the only way your work moves or survives.** Lose the phone
  with no backup and the work is gone. That is not a bug — it is the same property that
  means a thief who finds your phone gets nothing.

So: take a backup after every import, and again at the end of a heavy day.

**Changing your passphrase does not change your old backups.** Each backup is sealed with
whatever passphrase was in use when you made it. Change your passphrase and yesterday's
backup still needs yesterday's one. Take a fresh backup straight after changing it.

**Nothing is lost.** Every tick is saved as you make it. A flat battery or a force-quit
does not cost you a job.

**Locking a job** (on the job screen) marks it "don't touch" — useful when you are waiting
on the office. Nothing can be marked while it is locked.

**Next week's pack.** Import it the same way. It matches on job number and keeps
everything you have already recorded — it tells you exactly what it is going to do before
it does it.

**Fail reasons are yours.** The ones in the list were written by someone who has not done
the job. Settings → Fail reasons → change the wording to whatever you would actually
write. Renaming one does not affect jobs already marked with it.
