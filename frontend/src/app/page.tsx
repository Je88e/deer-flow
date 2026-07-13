import { redirect } from "next/navigation";

export default function LandingPage() {
  redirect("/workspace");
}
// export default function LandingPage() {
//   return (
//     <div className="min-h-screen w-full overflow-x-clip bg-[#0a0a0a]">
//       <Header />
//       <main className="flex w-full flex-col">
//         <Hero />
//         <CaseStudySection />
//         <SkillsSection />
//         <SandboxSection />
//         <WhatsNewSection />
//         <CommunitySection />
//       </main>
//       <Footer />
//     </div>
//   );
// }
