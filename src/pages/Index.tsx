import Navbar from "@/components/Navbar";
import DeliveryLanding from "@/components/home/DeliveryLanding";

const Index = () => {
  return (
    <div className="relative min-h-screen">
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-vector-grid" />
      <Navbar />
      <DeliveryLanding />
    </div>
  );
};

export default Index;
