import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import DeliveryLanding from "@/components/home/DeliveryLanding";
import { initializeMetaPixel } from "@/lib/metaPixel";

const Index = () => {
  useEffect(() => {
    void initializeMetaPixel();
  }, []);

  return (
    <div className="relative min-h-screen">
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-vector-grid" />
      <Navbar />
      <DeliveryLanding />
    </div>
  );
};

export default Index;
