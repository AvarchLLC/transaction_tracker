

'use client';

import './globals.css';
// import './blogs.css';
import { Rajdhani } from 'next/font/google';
import { Providers } from './providers';
import { Box, ColorModeScript, Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { SidebarProvider, useSidebar } from '@/components/Sidebar/SideBarContext';
import { useSidebarStore } from '@/stores/useSidebarStore';
import AppSidebar from '@/components/Sidebar/AppSidebar';

const Navbar = dynamic(() => import('@/components/Navbar'), { ssr: false });
const Footer = dynamic(() => import('@/components/Footer'), { ssr: false });
const Sidebar = dynamic(() => import('@/components/Sidebar/SideBar'), { ssr: false });

const mont = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // <SessionWrapper>
      <RootLayout>{children}</RootLayout>
    // </SessionWrapper>
  );
}

function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  return (
    <body className={mont.className}>
      <ColorModeScript initialColorMode="dark" />
      <AnimatePresence>
        <motion.div
          key={pathname}
          initial="initialState"
          animate="animateState"
          exit="exitState"
          transition={{ duration: 0.75 }}
          variants={{
            initialState: {
              opacity: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0% 100%)',
            },
            animateState: {
              opacity: 1,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0% 100%)',
            },
            exitState: {
              clipPath: 'polygon(50% 0, 50% 0, 50% 100%, 50% 100%)',
            },
          }}
          className="base-page-size"
        >
          <Providers>
            <SidebarProvider>
              <ClientContent>{children}</ClientContent>
            </SidebarProvider>
          </Providers>
        </motion.div>
      </AnimatePresence>
    </body>
  );
}

function ClientContent({ children }: { children: React.ReactNode }) {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);

  return (
    <Flex>
      {/* <AppSidebar /> */}
 <Box
        ml={isCollapsed ? "3rem" : "16rem"} // This creates space for the sidebar
        transition="margin-left 0.3s ease"
        p={4}
      >
        {/* <Navbar /> */}
        <Suspense fallback={<div>Loading...</div>}>
          {children}
        </Suspense>
        {/* <ConsentBanner />
        <FloatingContributionIcon /> */}
        {/* <Footer /> */}
      </Box>
    </Flex>
  );
}