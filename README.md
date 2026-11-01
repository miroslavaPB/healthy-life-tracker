# Healthy Life Tracker

A simple browser-based app for building healthy habits. Track your daily water
intake, sleep, and exercise, set personal goals, and review your progress over
time.

## Features

- Record habits for different dates
- Set goals for water, sleep, and exercise
- View progress reports and habit insights
- Get a daily motivational quote
- Save your data in your browser
- Export and restore records and personal goals using XML backups

## Run Locally

No dependencies, backend, or build step are required.

1. Download or clone the repository.
2. Open the `healthy-life-tracker` folder.
3. Open `index.html` in a modern web browser.

The app stores daily records and personal goals in the browser's Local Storage.
Those data stay in that browser unless you export a backup.

## Export and Import Backups

Open the **Резервно копие** section at the bottom of the page:

- Select **Експортирай данните** to download an XML file named
  `healthy-life-tracker-backup-YYYY-MM-DD.xml`.
- Select an `.xml` backup file to restore it. The app validates its format,
  dates, habit values, and goals before asking you to confirm replacement.
- Confirm to replace the current records and goals. If you cancel or the file
  is invalid, the data currently stored in the browser are left unchanged.

Backups use the app's version 2 data format. Quote content and application code
are not included. Keep backup files somewhere safe; clearing browser storage
does not delete exported files.
