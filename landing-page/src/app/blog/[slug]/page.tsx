import Link from 'next/link';
import { notFound } from 'next/navigation';

const posts = [
  {
    title: 'How to Digitize Your Kirana Store in 5 Simple Steps',
    excerpt: 'Transform your traditional shop into a smart store with billing, inventory, and udhar management — all from your phone.',
    date: 'May 15, 2026',
    slug: 'digitize-kirana-store',
    content: `
      <p>Running a Kirana store in today's world doesn't have to be limited to paper bills and a physical udhar book. Digitizing your shop can save hours each day, reduce mistakes, and help you grow faster.</p>
      
      <h2>Step 1: Start with Smart Billing</h2>
      <p>The easiest way to begin is to replace your handwritten bills with digital invoices. With Vyapar Sarthi, you can create GST-compliant bills in seconds. Just type the items, add quantities, and the total is calculated automatically. You can print the bill or share it via WhatsApp directly from the app.</p>
      
      <h2>Step 2: Digitize Your Inventory</h2>
      <p>Instead of guessing what's in stock, add all your products to the inventory section. You can categorize them by type — grocery, dairy, snacks, etc. Set minimum stock levels, and the app will alert you when an item is running low. No more running out of Atta on a busy Saturday morning.</p>
      
      <h2>Step 3: Move Your Udhar Book Online</h2>
      <p>Your physical udhar book is one of the most important — and most risky — parts of your business. With Vyapar Sarthi's Udhar Book, every credit sale is recorded automatically. You can see exactly how much each customer owes, when they last paid, and send them a WhatsApp reminder in one tap.</p>
      
      <h2>Step 4: Analyze Your Sales</h2>
      <p>Once you have digital records, you can see which products sell the most, which days are busiest, and what your profit margins look like. This data helps you make smarter decisions about what to stock and how to price it.</p>
      
      <h2>Step 5: Use AI Insights</h2>
      <p>Vyapar Sarthi goes a step further — it uses AI to analyze your data and give you personalized recommendations. From predicting which items will sell more next week to suggesting optimal prices, AI helps you run your shop like a pro.</p>
      
      <p>Digitizing your Kirana store doesn't require any technical skills. Just sign up, add your products, and start billing. Within a week, you'll wonder how you ever managed without it.</p>
    `,
  },
  {
    title: 'Top 10 Features Every Kirana Shop Management App Should Have',
    excerpt: 'From smart billing to AI insights, discover the must-have features that can save you time and grow your business.',
    date: 'April 28, 2026',
    slug: 'top-features-kirana-app',
    content: `
      <p>Choosing the right management app for your Kirana store is a big decision. Here are the 10 features you should look for before making your choice.</p>
      
      <h2>1. Fast and Easy Billing</h2>
      <p>The core of any shop management app is billing. Look for an app that lets you create bills in under 10 seconds with auto-calculation of totals, GST, and discounts.</p>
      
      <h2>2. Real-Time Inventory Tracking</h2>
      <p>Your stock should update automatically every time you create a bill. No manual adjustments needed. You should also get alerts when items reach their minimum stock level.</p>
      
      <h2>3. Udhar / Credit Management</h2>
      <p>A good app should let you record credit sales and track pending payments for each customer. Bonus points if it can send automatic reminders via WhatsApp.</p>
      
      <h2>4. Sales Reports & Analytics</h2>
      <p>You need to know which products are selling, what your daily revenue is, and how much profit you're making. Look for an app that generates easy-to-understand reports.</p>
      
      <h2>5. Multi-Language Support</h2>
      <p>India is a diverse country. The app should work in your preferred language — whether it's English, Hindi, Marathi, or others.</p>
      
      <h2>6. WhatsApp & Print Sharing</h2>
      <p>Customers often ask for a copy of their bill. Your app should let you share bills via WhatsApp or print them directly — no extra hardware needed.</p>
      
      <h2>7. Bulk Product Import</h2>
      <p>If you have hundreds of products, you don't want to add them one by one. Look for an app that lets you import products from Excel or CSV in minutes.</p>
      
      <h2>8. Mobile-Friendly Design</h2>
      <p>Most shop owners use their phone throughout the day. The app should work perfectly on a smartphone, not just on a desktop or tablet.</p>
      
      <h2>9. AI-Powered Insights</h2>
      <p>Advanced apps now offer AI features that analyze your data and give you suggestions — like which products to restock, what price to set, and which items are slow-moving.</p>
      
      <h2>10. Affordable Pricing</h2>
      <p>Finally, the app should fit your budget. Look for a free trial period and flexible pricing plans that grow with your business.</p>
      
      <p>Vyapar Sarthi checks all 10 boxes. Start your free trial today and see the difference.</p>
    `,
  },
  {
    title: 'Understanding Udhar Book: Digital Credit Management for Shop Owners',
    excerpt: 'Learn how digital udhar management can reduce losses, track customer credit, and improve cash flow for your shop.',
    date: 'April 10, 2026',
    slug: 'udhar-book-digital-credit',
    content: `
      <p>Udhar (credit) is a deeply rooted practice in Indian Kirana stores. Regular customers often buy on credit and pay later — weekly, monthly, or whenever they can. While this builds trust and loyalty, it also creates challenges.</p>
      
      <h2>The Problem with Physical Udhar Books</h2>
      <p>A physical notebook can be lost, damaged, or have entries that are hard to read. It's easy to forget who owes what, and tracking payment history becomes nearly impossible. Many shop owners lose thousands of rupees every year due to uncollected udhar.</p>
      
      <h2>How Digital Udhar Book Works</h2>
      <p>Vyapar Sarthi's Udhar Book replaces your physical notebook with a digital ledger. Every time you create a bill with a credit payment type, it's automatically recorded. You can see:</p>
      <ul>
        <li>Each customer's total outstanding balance</li>
        <li>Payment history with dates and amounts</li>
        <li>When a customer last paid or purchased on credit</li>
      </ul>
      
      <h2>Sending Payment Reminders</h2>
      <p>One of the most powerful features is the ability to send WhatsApp payment reminders. With one tap, you can send a polite message to a customer listing their outstanding amount. This reduces the awkwardness of asking for payment in person and improves collection rates.</p>
      
      <h2>Reducing Losses</h2>
      <p>Studies show that digital udhar management can reduce uncollected credit by up to 40%. When you can see exactly who owes what and send timely reminders, customers are more likely to pay on time.</p>
      
      <p>Ready to digitize your udhar book? Vyapar Sarthi makes it simple. Sign up today and never lose track of credit sales again.</p>
    `,
  },
  {
    title: 'Why Your Shop Needs AI-Powered Inventory Management',
    excerpt: 'AI can predict demand, reduce waste, and optimize stock levels. See how small shops are benefiting from smart inventory.',
    date: 'March 22, 2026',
    slug: 'ai-inventory-management',
    content: `
      <p>Artificial Intelligence isn't just for big tech companies. Small Kirana shops across India are now using AI to manage their inventory smarter — and the results are impressive.</p>
      
      <h2>Predicting Demand</h2>
      <p>One of the biggest challenges for shop owners is knowing how much stock to keep. Too little, and you lose sales. Too much, and products expire or sit on shelves. AI analyzes your past sales data to predict what will sell and when. For example, it might tell you that you'll sell 20% more rice during the first week of the month when customers get their salaries.</p>
      
      <h2>Reducing Waste</h2>
      <p>For shops that sell perishable goods, waste is a major cost. AI can identify slow-moving items and suggest discounts before they expire. It can also recommend optimal order quantities to minimize spoilage.</p>
      
      <h2>Smart Restocking Alerts</h2>
      <p>Instead of checking each product manually, AI monitors your inventory in real time and alerts you when it's time to reorder. But it goes further — it can even suggest which specific products to restock based on sales velocity and seasonality.</p>
      
      <h2>Pricing Optimization</h2>
      <p>AI analyzes your profit margins, competitor pricing (where available), and demand patterns to suggest the best prices for your products. A small increase on high-demand items can significantly boost your monthly profit.</p>
      
      <p>With Vyapar Sarthi's AI Insights, you get all of this and more — in simple language that's easy to understand. No technical knowledge needed.</p>
    `,
  },
  {
    title: 'The Future of Kirana Stores in India: 2026 & Beyond',
    excerpt: 'Explore how technology is reshaping India\'s 12+ million Kirana stores and what it means for shop owners.',
    date: 'March 5, 2026',
    slug: 'future-of-kirana-stores',
    content: `
      <p>India has over 12 million Kirana stores — more than all the modern retail chains combined. These stores serve as the backbone of the Indian retail economy. But the way they operate is changing fast.</p>
      
      <h2>Digital Transformation is Accelerating</h2>
      <p>After the pandemic, millions of shop owners adopted digital payments. Now, the next wave of transformation is about full digital management — billing, inventory, accounting, and customer relationships. By 2027, experts predict that over 60% of urban Kirana stores will use some form of digital management software.</p>
      
      <h2>The Rise of Unified Platforms</h2>
      <p>Shop owners no longer want to juggle multiple apps for billing, inventory, and payments. They want one platform that does everything. This is why apps like Vyapar Sarthi are gaining popularity — they combine billing, inventory, udhar management, AI insights, and more in a single, easy-to-use interface.</p>
      
      <h2>AI Will Become Standard</h2>
      <p>Just as UPI payments became the norm within a few years, AI-powered insights will soon be expected in any shop management app. From predicting inventory needs to suggesting optimal prices, AI will help shop owners make data-driven decisions without needing any technical expertise.</p>
      
      <h2>The Human Touch Remains</h2>
      <p>Despite all this technology, the personal relationship between a Kirana shop owner and their customers remains the most important asset. Technology should enhance this relationship, not replace it. Digital tools free up time so shop owners can focus on what matters most — serving their customers and growing their business.</p>
      
      <p>The future of Kirana stores is bright. With the right tools, small shops can compete with large retailers while keeping their unique personal touch. Vyapar Sarthi is proud to be part of this transformation.</p>
    `,
  },
];

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-indigo-400 transition mb-8">
          &larr; Back to Blog
        </Link>
        <article>
          <p className="text-xs text-slate-500 mb-3">{post.date}</p>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-100 mb-6 leading-tight">
            {post.title}
          </h1>
          <div
            className="prose prose-invert prose-slate max-w-none prose-headings:text-slate-100 prose-headings:text-xl prose-headings:font-bold prose-headings:mt-8 prose-headings:mb-3 prose-p:text-slate-300 prose-p:leading-relaxed prose-p:mb-4 prose-ul:text-slate-300 prose-li:mb-2 prose-a:text-indigo-400"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>
      </div>
    </div>
  );
}
