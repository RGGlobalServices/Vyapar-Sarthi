const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/staff/page.tsx', {
  "useTranslations\\('Dashboard'\\)": "useTranslations('Staff')",
  'Staff Management': "{t('title')}",
  'Manage your manpower, attendance, and salaries.': "{t('desc')}",
  '> Attendance<': ">{t('attendance')}<",
  'Add Staff': "{t('addStaff')}",
  'Search staff by name or mobile...': "{t('searchPlaceholder')}",
  'Total Staff': "{t('totalStaff')}",
  'Present Today': "{t('presentToday')}",
  'Absent Today': "{t('absentToday')}",
  'Pending Salary': "{t('pendingSalary')}",
  '>Name / Role<': ">{t('colName')}<",
  '>Contact<': ">{t('colContact')}<",
  '>Status<': ">{t('colStatus')}<",
  '>Salary / Wages<': ">{t('colSalary')}<",
  '>Actions<': ">{t('colActions')}<",
  'View Profile': "{t('viewProfile')}",
  'Mark Attendance': "{t('markAttendance')}",
  'No staff members found': "{t('noStaff')}"
});

console.log('Staff page updated.');
