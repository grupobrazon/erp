import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { DragDropContext } from "@hello-pangea/dnd";
import SuggestedRouteCard from "@/components/routing/SuggestedRouteCard";

export default function ZoneDayGrid({ zone, allUnassigned, departureAddress = "", departureLat = null, departureLng = null }) {
  const { toast } = useToast();

  // Stops state for all days in this zone
  const [dayStops, setDayStops] = useState(() => {
    const map = {};
    for (const day of zone.days) {
      const all = (day.technician_routes || []).flatMap((tr, ti) =>
        tr.stops.map(s => ({ ...s, tech_index: ti, total_distance_km: tr.total_distance_km }))
      );
      map[day.date] = all;
    }
    return map;
  });
  const [recalculating, setRecalculating] = useState({});

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const srcDate = result.source.droppableId;
    const dstDate = result.destination.droppableId;

    if (srcDate === dstDate) {
      // Reorder within same day
      const reordered = [...(dayStops[srcDate] || [])];
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, moved);
      setDayStops(p => ({ ...p, [srcDate]: reordered }));
    } else {
      // Move between days
      const srcStops = [...(dayStops[srcDate] || [])];
      const dstStops = [...(dayStops[dstDate] || [])];
      const [moved] = srcStops.splice(result.source.index, 1);
      dstStops.splice(result.destination.index, 0, moved);
      setDayStops(p => ({ ...p, [srcDate]: srcStops, [dstDate]: dstStops }));
      toast({ title: `Atendimento movido`, description: `${moved.os_code} — ${moved.client_name} movido para ${dstDate}` });
    }
  };

  const recalculateDay = async (date) => {
    const stops = dayStops[date] || [];
    if (stops.length === 0) return;
    setRecalculating(p => ({ ...p, [date]: true }));
    try {
      const res = await base44.functions.invoke("recalculateDayRoute", {
        os_ids: stops.map(s => s.os_id), date, zone_id: zone.zone_id,
      });
      const data = res.data;
      if (data?.stops) {
        setDayStops(p => ({ ...p, [date]: data.stops }));
        toast({ title: "Rota recálculada", description: `${data.total_distance_km || 0} km • ${data.total_travel_min || 0} min de deslocamento` });
      }
    } catch (e) {
      toast({ title: "Erro ao recalcular", description: e.message, variant: "destructive" });
    } finally {
      setRecalculating(p => ({ ...p, [date]: false }));
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {zone.days.map(day => (
          <SuggestedRouteCard
            key={day.date}
            dayPlan={day}
            zone={zone}
            allUnassigned={allUnassigned}
            stops={dayStops[day.date] || []}
            departureAddress={departureAddress}
            departureLat={departureLat}
            departureLng={departureLng}
            onStopsChange={(newStops) => setDayStops(p => ({ ...p, [day.date]: newStops }))}
            onRecalculate={() => recalculateDay(day.date)}
            recalculating={!!recalculating[day.date]}
          />
        ))}
      </div>
    </DragDropContext>
  );
}