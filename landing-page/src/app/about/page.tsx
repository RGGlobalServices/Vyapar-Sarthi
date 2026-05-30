"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const stats = [
  { label: "Active Shop Owners", value: 10, suffix: "+" },
  { label: "City Covered", value: 1, suffix: "" },
  { label: "Monthly Transactions", value: 10000, suffix: "+", format: true },
];

const team = [
  { name: "Rahul Gosavi", role: "Product Research & Development Head", initials: "RG" },
  { name: "Ashish Gosavi", role: "Marketing Team Head", initials: "AG" },
  { name: "Adarsh More", role: "Marketing Team", initials: "AM" },
  { name: "Harsh Dharnkar", role: "Marketing Team", initials: "HD" },
  { name: "Sai Kale", role: "Marketing Team", initials: "SK" },
];

function CountUp({ target, suffix, format }: { target: number; suffix: string; format?: boolean }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !counted.current) {
          counted.current = true;
          const duration = 2000;
          const steps = 60;
          const increment = target / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {format ? `${(count / 1000).toFixed(count >= 1000 ? 1 : 0)}K` : count}
      {suffix}
    </span>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              About Vyapar Sarthi
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Empowering India&apos;s Kirana stores with smart technology. We believe every shop owner deserves modern tools to grow their business.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-20">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center">
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                <CountUp target={stat.value} suffix={stat.suffix} format={stat.format} />
              </div>
              <div className="text-slate-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-20">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-slate-100 mb-4">Our Mission</h2>
            <p className="text-slate-400 leading-relaxed">
              To simplify shop management for every Kirana store owner in India through intuitive, affordable, and powerful technology — bridging the gap between traditional retail and modern commerce.
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-slate-100 mb-4">Our Vision</h2>
            <p className="text-slate-400 leading-relaxed">
              A future where every small shop in India runs smarter — with real-time inventory, digital payments, AI-powered insights, and seamless customer management — all from their phone.
            </p>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-center text-slate-100 mb-10">Our Team</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-20">
          {team.map((member) => (
            <div key={member.name} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center hover:border-indigo-500/30 transition group">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-cyan-500 mx-auto mb-4 flex items-center justify-center text-xl font-bold text-white group-hover:scale-110 transition">
                {member.initials}
              </div>
              <h3 className="text-slate-200 font-semibold">{member.name}</h3>
              <p className="text-slate-400 text-sm">{member.role}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-20">
          <Link
            href="/register"
            className="inline-flex px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-lg shadow-lg hover:shadow-indigo-500/25 hover:scale-105 transition-all duration-300"
          >
            Start Your Journey
          </Link>
        </div>
      </div>
    </div>
  );
}
