const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/support/page.tsx', {
  "useTranslations\\('Dashboard'\\)": "useTranslations('Support')",
  'Help & Support': "{t('title')}",
  "Need help with your business\\? We're here for you.": "{t('desc')}",
  '>Contact Us<': ">{t('contactUs')}<",
  'Email Support': "{t('emailLabel')}",
  'We reply within 24 hours': "{t('emailDesc')}",
  'WhatsApp Support': "{t('whatsappLabel')}",
  'Chat with our team directly': "{t('whatsappDesc')}",
  'Call Us': "{t('callLabel')}",
  'Mon-Sat, 10 AM to 6 PM': "{t('callDesc')}",
  'Frequently Asked Questions': "{t('faqs')}",
  'How do I add products\\?': "{t('q1')}",
  'Go to Inventory > Add Product and enter details.': "{t('a1')}",
  'Is my data secure\\?': "{t('q2')}",
  'Yes, we use enterprise-grade cloud security.': "{t('a2')}",
  'How to print bills\\?': "{t('q3')}",
  'Connect a Bluetooth thermal printer and print from the Billing section.': "{t('a3')}",
  'Submit a Support Ticket': "{t('submitTicket')}",
  'Issue Type': "{t('issueType')}",
  'Billing Issue': "{t('billingIssue')}",
  'Technical Issue': "{t('technicalIssue')}",
  '>Other<': ">{t('other')}<",
  '>Message<': ">{t('messageLabel')}<",
  'Describe your issue in detail...': "{t('messagePlaceholder')}",
  'Send Message': "{t('send')}",
  'Message Sent!': "{t('successTitle')}",
  'Our support team will get back to you shortly.': "{t('successDesc')}"
});

console.log('Support page updated.');
