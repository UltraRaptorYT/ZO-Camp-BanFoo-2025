"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import react-leaflet (SSR off)
const MapContainer = dynamic(
  async () => (await import("react-leaflet")).MapContainer,
  { ssr: false }
);
const TileLayer = dynamic(
  async () => (await import("react-leaflet")).TileLayer,
  { ssr: false }
);
const Marker = dynamic(async () => (await import("react-leaflet")).Marker, {
  ssr: false,
});
const Circle = dynamic(async () => (await import("react-leaflet")).Circle, {
  ssr: false,
});
const useMap = () => {
  // small hook wrapper since we can’t dynamic-import hooks directly
  const { useMap } = require("react-leaflet");
  return useMap();
};

// Fix default marker icons (so they show up in Next.js)
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type LatLng = { lat: number; lng: number };

function LocationTracker({
  follow,
  minFollowZoom = 16,
}: {
  follow: boolean;
  minFollowZoom?: number;
}) {
  const map = useMap();
  const [pos, setPos] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      console.warn("Geolocation not supported by this browser.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const { latitude, longitude, accuracy } = p.coords;
        const next: LatLng = { lat: latitude, lng: longitude };
        setPos(next);
        setAccuracy(accuracy ?? null);

        if (follow) {
          const currentZoom = map.getZoom();
          const targetZoom = Math.max(currentZoom, minFollowZoom);
          map.setView(next as any, targetZoom, { animate: true });
        }
      },
      (err) => {
        console.warn("Geolocation error:", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 10_000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [follow, map, minFollowZoom]);

  if (!pos) return null;

  return (
    <>
      <Marker position={pos as any} />
      {accuracy && (
        <Circle
          center={pos as any}
          radius={accuracy}
          pathOptions={{ weight: 1, fillOpacity: 0.1 }}
        />
      )}
    </>
  );
}

export default function UserMap() {
  // Start roughly on Singapore; will recenter when we get a fix
  const initialCenter = useMemo<LatLng>(
    () => ({ lat: 1.3521, lng: 103.8198 }),
    []
  );
  const [follow, setFollow] = useState(true);

  // Imperative “locate me” button
  const LocateButton = () => {
    const map = useMap();
    return (
      <button
        onClick={() => {
          if (!("geolocation" in navigator)) return;
          navigator.geolocation.getCurrentPosition(
            (p) => {
              const { latitude, longitude } = p.coords;
              map.setView([latitude, longitude], Math.max(map.getZoom(), 16), {
                animate: true,
              });
            },
            (e) => console.warn(e),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        }}
        style={{
          position: "absolute",
          zIndex: 1000,
          top: 12,
          right: 12,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "white",
          cursor: "pointer",
        }}
      >
        Locate me
      </button>
    );
  };

  const FollowToggle = () => (
    <button
      onClick={() => setFollow((f) => !f)}
      style={{
        position: "absolute",
        zIndex: 1000,
        top: 54,
        right: 12,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #ccc",
        background: follow ? "white" : "white",
        cursor: "pointer",
      }}
      title="Toggle follow"
    >
      {follow ? "Following ✓" : "Follow me"}
    </button>
  );

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <MapContainer
        center={initialCenter as any}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
        preferCanvas // ✅ render vectors via canvas
        zoomAnimation={false} // ✅ faster first paint
        fadeAnimation={true}
        markerZoomAnimation={false}
        inertia={true}
        inertiaDeceleration={3000}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          // url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          // url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          updateWhenIdle
          keepBuffer={1}
        />
        {/* UI buttons rendered over the map */}
        <LocateButton />
        <FollowToggle />

        {/* Live user tracking */}
        <LocationTracker follow={follow} />
      </MapContainer>
    </div>
  );
}
