const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/profile/page.tsx', {
  '> Business Profile<': ">{t('title')}<",
  '>Business Information<': ">{t('businessInfo')}<",
  '>Personal Information<': ">{t('personalInfo')}<",
  '>Security<': ">{t('security')}<",
  '>Save Changes<': ">{t('saveChanges')}<",
  '>Upload Logo<': ">{t('uploadLogo')}<",
  '>Change Logo<': ">{t('changeLogo')}<",
  '>Shop Name<': ">{t('shopName')}<",
  '>Business Type<': ">{t('shopType')}<",
  '>Address<': ">{t('address')}<",
  '>Full Name<': ">{t('fullName')}<",
  '>Email<': ">{t('email')}<",
  '>Mobile Number<': ">{t('mobile')}<",
  '>Subscription<': ">{t('subscription')}<",
  '>Plan<': ">{t('plan')}<",
  'Active till': "{t('activeTill')}",
  '>Change Password<': ">{t('changePassword')}<",
  '>Current Password<': ">{t('currentPassword')}<",
  '>New Password<': ">{t('newPassword')}<",
  '>Confirm Password<': ">{t('confirmPassword')}<",
  '>Profit Lock<': ">{t('profitLock')}<",
  '>Set a password to hide todays profit on the dashboard.<': ">{t('profitLockDesc')}<",
  '>Set Profit Password<': ">{t('setProfitPwd')}<",
  ">View Today's Profit<": ">{t('viewProfit')}<",
  '>Enter Profit Password to View<': ">{t('enterProfitPwd')}<",
  '>Total Revenue<': ">{t('totalRevenue')}<",
  '>Total Profit<': ">{t('totalProfit')}<",
  '> Sales<': ">{t('sales')}<",
  '>Cancel<': ">{t('cancel')}<",
  '>Submit<': ">{t('submit')}<"
});

console.log('Profile page updated.');
