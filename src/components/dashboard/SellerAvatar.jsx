import React from "react";

// Avatar do vendedor usado no Dashboard Comercial (foto cadastrada ou iniciais).
export default function SellerAvatar({ seller, size = "lg" }) {
  const sizeClass = size === "lg" ? "w-20 h-20 text-2xl" : "w-10 h-10 text-sm";
  if (seller?.photo_url) {
    return (
      <img
        src={seller.photo_url}
        alt={seller.name}
        className={`${sizeClass} rounded-full object-cover border-2 border-primary/20`}
      />
    );
  }
  const initials = (seller?.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`${sizeClass} rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center border-2 border-primary/20`}>
      {initials}
    </div>
  );
}