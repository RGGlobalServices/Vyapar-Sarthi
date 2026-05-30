'use client';

import { useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    q: 'क्या यह app फ्री है?',
    a: 'हाँ, हम एक 30 दिन का फ्री ट्रायल देते हैं जिसमें आप सभी features बिना किसी cost के use कर सकते हैं। उसके बाद आप अपने बजट के हिसाब से कोई भी plan चुन सकते हैं।',
  },
  {
    q: 'कैसे रजिस्टर करूं?',
    a: 'बस ऊपर "Start Free Trial" बटन पर क्लिक करें, अपना नाम, दुकान का नाम, मोबाइल नंबर और email डालें। 2 मिनट में आपका अकाउंट बन जाएगा और आप बिल बनाना शुरू कर सकते हैं।',
  },
  {
    q: 'क्या मैं बिना इंटरनेट के भी use कर सकता हूँ?',
    a: 'फिलहाल Vyapar Sarthi को इंटरनेट कनेक्शन की आवश्यकता है। यह एक web-based app है जो आपके browser पर चलती है। हालांकि, इसे चलाने के लिए तेज़ इंटरनेट की ज़रूरत नहीं है — सामान्य 3G/4G भी काफी है।',
  },
  {
    q: 'कितने products add कर सकते हैं?',
    a: 'हमारे Small Store plan में 500 products तक, Big Store और Wholesale plans में unlimited products add कर सकते हैं। साथ ही Excel के ज़रिए bulk में products अपलोड करने की सुविधा भी है।',
  },
  {
    q: 'क्या मेरा डेटा safe है?',
    a: 'बिल्कुल। आपका सारा डेटा end-to-end encrypted है और secure cloud servers पर store होता है। हम कभी भी आपके डेटा को तीसरे पक्ष के साथ साझा नहीं करते।',
  },
  {
    q: 'क्या मुझे कुछ install करना होगा?',
    a: 'बिल्कुल नहीं। Vyapar Sarthi एक web app है — आपको कुछ भी download या install करने की ज़रूरत नहीं है। बस अपने phone, tablet या laptop के browser पर website खोलें और तुरंत शुरू करें।',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section id="support" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Common questions about Vyapar Sarthi.
          </p>
        </div>

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={visible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-3"
        >
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`rounded-2xl border transition-colors ${
                  isOpen
                    ? 'border-indigo-500/30 bg-slate-800/60'
                    : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600/50'
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="pr-4 text-base font-medium text-white">{faq.q}</span>
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                      isOpen ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700/50 text-slate-400'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-slate-700/50 px-6 pb-5 pt-4 text-sm leading-relaxed text-slate-400">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
