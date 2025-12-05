import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { ArrowRight, Activity, DollarSign, AlertTriangle, Shield, Smartphone, Watch, Box, ChevronDown, Mail } from 'lucide-react';
import { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

// --- COLOR PALETTE REFERENCE ---
// --blue-bell: #4AA4E1
// --fresh-sky: #54B4F0
// --baltic-blue: #285D91
// --baltic-blue-2: #245985
// --blue-bell-2: #4795D1
// --baltic-blue-3: #29619A

// Type definitions
interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  desc: string;
  color: 'red' | 'green' | 'orange';
  delay: number;
}

interface ProductCardProps {
  icon: LucideIcon;
  name: string;
  tagline: string;
  features: string[];
  gradient: string;
  delay: number;
}

interface TeamMember {
  name: string;
  role: string;
  email: string;
  description: string;
}

const LandingPage = () => {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  // Smooth scroll handler
  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (element) {
      const offsetTop = element.getBoundingClientRect().top + window.pageYOffset - 80; // 80px offset for fixed header
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white font-sans text-gray-900 overflow-x-hidden">
      
      {/* --- ENHANCED HEADER --- */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed w-full bg-white/80 backdrop-blur-xl shadow-sm z-50 border-b border-gray-100"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center space-x-3"
            >
              <img 
                src="/caresync.svg" 
                alt="CareSync Logo" 
                className="w-12 h-12 object-contain rounded-xl"
              />
              <span className="text-2xl font-bold bg-gradient-to-r from-[#285D91] to-[#54B4F0] bg-clip-text text-transparent">
                CareSync
              </span>
            </motion.div>
            
            <div className="hidden md:flex space-x-8 items-center">
              {['Impact', 'Products', 'Team', 'About'].map((item, i) => (
                <motion.a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  onClick={(e) => handleSmoothScroll(e, `#${item.toLowerCase()}`)}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 + 0.3 }}
                  whileHover={{ y: -2 }}
                  className="text-gray-600 hover:text-[#285D91] font-medium transition-colors relative group"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#285D91] transition-all group-hover:w-full" />
                </motion.a>
              ))}
              <motion.a
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                whileHover={{ scale: 1.05, boxShadow: "0 10px 30px -10px rgba(84, 180, 240, 0.5)" }}
                whileTap={{ scale: 0.95 }}
                href="/dashboard"
                className="bg-gradient-to-r from-[#285D91] to-[#54B4F0] text-white px-6 py-2.5 rounded-full font-medium shadow-lg shadow-[#54B4F0]/30 transition-all"
              >
                Open Dashboard
              </motion.a>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* --- HERO SECTION WITH ENHANCED ANIMATIONS --- */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-40 text-center px-4 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 -z-10">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.03, 0.08, 0.03],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#4AA4E1] rounded-full blur-3xl"
          />
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.03, 0.08, 0.03],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#54B4F0] rounded-full blur-3xl"
          />
        </div>

        <motion.div
          style={{ opacity, scale }}
          className="relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="inline-block mb-6"
          >
            <div className="bg-[#4AA4E1]/10 text-[#285D91] px-6 py-2 rounded-full text-sm font-semibold border border-[#4AA4E1]/20 shadow-sm">
              🏥 Making Healthcare Accessible for Everyone
            </div>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl md:text-7xl font-extrabold text-gray-900 leading-tight"
          >
            Your health,{' '}
            <span className="bg-gradient-to-r from-[#285D91] to-[#54B4F0] bg-clip-text text-transparent">
              on time.
            </span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-6 text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed"
          >
            The complete medication management ecosystem designed for{' '}
            <span className="font-semibold text-gray-900">reliability</span>,{' '}
            <span className="font-semibold text-gray-900">accessibility</span>, and{' '}
            <span className="font-semibold text-gray-900">peace of mind</span>.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <motion.a
              whileHover={{ scale: 1.05, boxShadow: "0 20px 40px -10px rgba(40, 93, 145, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              href="#products"
              onClick={(e) => handleSmoothScroll(e, '#products')}
              className="inline-flex items-center px-8 py-4 text-lg font-semibold rounded-2xl text-white bg-gradient-to-r from-[#285D91] to-[#54B4F0] shadow-xl shadow-[#54B4F0]/30 transition-all"
            >
              Explore Products <ArrowRight className="ml-2 h-5 w-5" />
            </motion.a>
            
            <motion.a
              whileHover={{ scale: 1.05, borderColor: "#285D91" }}
              whileTap={{ scale: 0.95 }}
              href="#contact"
              onClick={(e) => handleSmoothScroll(e, '#contact')}
              className="inline-flex items-center px-8 py-4 text-lg font-semibold rounded-2xl text-[#285D91] bg-white border-2 border-gray-200 hover:border-[#285D91] transition-all shadow-lg"
            >
              Schedule Demo
            </motion.a>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 left-1/2 transform -translate-x-1/2 cursor-pointer"
          onClick={(e) => handleSmoothScroll(e as any, '#impact')}
        >
          <ChevronDown className="w-8 h-8 text-gray-400" />
        </motion.div>
      </section>

      {/* --- ENHANCED STATS SECTION --- */}
      <section id="impact" className="py-24 bg-gradient-to-b from-white to-gray-50 relative overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              The Medication Crisis
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Non-adherence to medication is a global healthcare challenge with devastating consequences
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Activity, value: "50%", label: "Non-Adherence Rate", desc: "Chronic disease patients don't take meds as prescribed", color: "red" as const, delay: 0 },
              { icon: DollarSign, value: "$300B", label: "Annual Cost", desc: "Avoidable healthcare costs generated annually", color: "green" as const, delay: 0.2 },
              { icon: AlertTriangle, value: "125K", label: "Annual Deaths", desc: "Lives lost in the US annually due to non-adherence", color: "orange" as const, delay: 0.4 }
            ].map((stat, i) => (
              <StatCard key={i} {...stat} />
            ))}
          </div>
        </div>
      </section>

      {/* --- PRODUCTS SECTION --- */}
      <section id="products" className="py-24 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Complete Ecosystem
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Three integrated products working together to ensure medication adherence
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Box,
                name: "CareBox",
                tagline: "Smart Medication Hub",
                features: ["Multi-sensory alerts", "Modular carousel design", "Raspberry Pi powered"],
                // Baltic Blue to Fresh Sky
                gradient: "from-[#285D91] to-[#54B4F0]"
              },
              {
                icon: Watch,
                name: "CareBand",
                tagline: "Wearable Reminders",
                features: ["Vibration & LED alerts", "Flexible TPU design", "Battery optimized"],
                // Baltic Blue 2 to Blue Bell
                gradient: "from-[#245985] to-[#4AA4E1]"
              },
              {
                icon: Smartphone,
                name: "CareApp",
                tagline: "Connected Platform",
                features: ["Real-time tracking", "Caregiver notifications", "Schedule management"],
                // Baltic Blue 3 to Blue Bell 2
                gradient: "from-[#29619A] to-[#4795D1]"
              }
            ].map((product, i) => (
              <ProductCard key={i} {...product} delay={i * 0.2} />
            ))}
          </div>
        </div>
      </section>

      {/* --- TEAM SECTION --- */}
      <section id="team" className="py-24 bg-gradient-to-b from-gray-50 to-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Our Team
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Team GridHierarchy - Multidisciplinary innovators from University of Aveiro
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamMembers.map((member, i) => (
              <TeamCard key={i} member={member} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* --- ABOUT SECTION --- */}
      <section id="about" className="py-24 bg-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              About CareSync
            </h2>
            <div className="text-lg text-gray-600 space-y-4 text-left">
              <p>
                CareSync is a multidisciplinary project developed at the <span className="font-semibold text-gray-900">University of Aveiro</span> by Electrical and Computer Engineering students.
              </p>
              <p>
                Our mission is to make medication management <span className="font-semibold text-gray-900">safer, simpler, and more inclusive</span> by combining smart technology with human-centered design. The CareSync ecosystem — composed of the CareBox, CareBand, and CareApp — supports patients, caregivers, and healthcare professionals.
              </p>
              <p>
                By promoting accessibility, innovation, and empathy, CareSync aims to empower people of all ages and abilities to live healthier and more independent lives.
              </p>
              <p className="text-center text-[#285D91] font-semibold pt-4">
                📅 Project Timeline: October 2025 - June 2026
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- CONTACT SECTION --- */}
      <section id="contact" className="py-24 bg-gradient-to-b from-gray-50 to-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Ready to Transform Medication Management?
            </h2>
            <p className="text-xl text-gray-600 mb-10">
              Join us in making healthcare more accessible and effective for everyone
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="mailto:franciscoluis@ua.pt"
                className="inline-flex items-center px-8 py-4 text-lg font-semibold rounded-2xl text-white bg-gradient-to-r from-[#285D91] to-[#54B4F0] shadow-xl shadow-[#54B4F0]/30 transition-all"
              >
                <Mail className="mr-2 h-5 w-5" />
                Schedule Demo
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="mailto:brunosilvaluis@ua.pt"
                className="inline-flex items-center px-8 py-4 text-lg font-semibold rounded-2xl text-[#285D91] bg-white border-2 border-gray-200 hover:border-[#285D91] transition-all shadow-lg"
              >
                <Mail className="mr-2 h-5 w-5" />
                Partnership Inquiry
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-gradient-to-b from-gray-50 to-gray-100 border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <img 
                src="/caresync.svg" 
                alt="CareSync Logo" 
                className="w-10 h-10 object-contain rounded-lg"
              />
              <span className="text-xl font-bold text-gray-900">CareSync</span>
            </div>
            <p className="text-gray-600">
              © 2025 CareSync Project — University of Aveiro
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Team data
const teamMembers: TeamMember[] = [
  { name: "Francisco Luis", role: "CTO", email: "franciscoluis@ua.pt", description: "Oversees and coordinates all project activities" },
  { name: "Bruno Luis", role: "CMM", email: "brunosilvaluis@ua.pt", description: "Develops marketing strategies and communication" },
  { name: "Adriana Pires", role: "TC (CareBox)", email: "adrianapires@ua.pt", description: "Leads CareBox system design and implementation" },
  { name: "José Trincão", role: "TC (CareApp)", email: "josetrincao06@ua.pt", description: "Manages CareApp development and deployment" },
  { name: "João Anjos", role: "TC (CareBand)", email: "joaoanjoss@ua.pt", description: "Coordinates CareBand development activities" },
  { name: "Hugo Navarro", role: "ENG (CareBand)", email: "hugonavarro@ua.pt", description: "Complete development of CareBand components" },
  { name: "Miguel Valente", role: "ENG (CareBox)", email: "mdvalente13@ua.pt", description: "CareBox software development and testing" },
  { name: "Joana Costa", role: "ENG (CareBox)", email: "joanavcosta@ua.pt", description: "Designs and develops CareBox hardware" },
  { name: "Mauricio Tomás", role: "ENG (CareBox)", email: "mauriciotomas@ua.pt", description: "Designs and tests CareBox hardware components" },
  { name: "Ivo Silva", role: "ENG (CareApp)", email: "ivo.m.silva@ua.pt", description: "Frontend/backend development and integration" },
  { name: "Denis Sukhachev", role: "ENG (CareApp)", email: "denis.s@ua.pt", description: "Frontend/backend development and integration" },
  { name: "Miguel Macedo", role: "ENG (CareApp)", email: "macedo.miguel@ua.pt", description: "CareApp software development and optimization" }
];

const StatCard = ({ icon: Icon, value, label, desc, color, delay }: StatCardProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  const colorClasses: Record<'red' | 'green' | 'orange', string> = {
    red: "from-red-500 to-rose-500",
    green: "from-green-500 to-emerald-500",
    orange: "from-orange-500 to-amber-500"
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { 
        opacity: 1, 
        y: 0,
        transition: { duration: 0.6, delay }
      } : {}}
      whileHover={{ 
        y: -8, 
        boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1)",
        transition: { duration: 0.3, delay: 0 }
      }}
      className="p-8 bg-white rounded-3xl border border-gray-100 shadow-lg transition-all"
    >
      <motion.div
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ type: "spring", stiffness: 300 }}
        className={`w-16 h-16 bg-gradient-to-br ${colorClasses[color]} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}
      >
        <Icon className="h-8 w-8 text-white" />
      </motion.div>
      
      <motion.div
        initial={{ scale: 0 }}
        animate={isInView ? { 
          scale: 1,
          transition: { duration: 0.5, delay: delay + 0.3, type: "spring" }
        } : {}}
        className="text-5xl font-extrabold text-gray-900 mb-2"
      >
        {value}
      </motion.div>
      
      <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {label}
      </div>
      <p className="text-gray-600 leading-relaxed">{desc}</p>
    </motion.div>
  );
};

const ProductCard = ({ icon: Icon, name, tagline, features, gradient, delay }: ProductCardProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { 
        opacity: 1, 
        y: 0,
        transition: { duration: 0.6, delay }
      } : {}}
      whileHover={{ 
        y: -10,
        transition: { duration: 0.2, delay: 0 }
      }}
      className="group relative p-8 bg-white rounded-3xl border border-gray-100 shadow-lg hover:shadow-2xl transition-all overflow-hidden"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
      
      <div className={`w-16 h-16 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center mb-6 shadow-lg transform group-hover:scale-110 transition-transform`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      
      <h3 className="text-2xl font-bold text-gray-900 mb-2">{name}</h3>
      <p className="text-gray-600 mb-6">{tagline}</p>
      
      <ul className="space-y-3">
        {features.map((feature: string, i: number) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { 
              opacity: 1, 
              x: 0,
              transition: { duration: 0.4, delay: delay + 0.1 * i }
            } : {}}
            className="flex items-center text-gray-700"
          >
            <Shield className="w-5 h-5 text-[#285D91] mr-3 flex-shrink-0" />
            {feature}
          </motion.li>
        ))}
      </ul>

      <motion.div
        whileHover={{ 
          x: 5,
          transition: { duration: 0.2, delay: 0 }
        }}
        className="mt-6 inline-flex items-center text-[#285D91] font-semibold cursor-pointer"
      >
        Learn more <ArrowRight className="ml-2 w-4 h-4" />
      </motion.div>
    </motion.div>
  );
};

const TeamCard = ({ member, delay }: { member: TeamMember; delay: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { 
        opacity: 1, 
        y: 0,
        transition: { 
          duration: 0.2, 
          delay: delay
        }
      } : {}}
      
      whileHover={{ 
        y: -5, 
        boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.15)",
        transition: { duration: 0.2, delay: 0 }
      }}
      
      className="p-6 bg-white rounded-2xl border border-gray-100 shadow-md transition-all"
    >
      <h3 className="text-xl font-bold text-gray-900 mb-1">{member.name}</h3>
      <div className="text-sm font-semibold text-[#4AA4E1] mb-3">{member.role}</div>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{member.description}</p>
      <a 
        href={`mailto:${member.email}`}
        className="inline-flex items-center text-sm text-gray-500 hover:text-[#285D91] transition-colors"
      >
        <Mail className="w-4 h-4 mr-2" />
        {member.email}
      </a>
    </motion.div>
  );
};

export default LandingPage;
