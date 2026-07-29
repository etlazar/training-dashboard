import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [12, 12] });
    } else if (positions.length === 1) {
      map.setView(positions[0], 14);
    }
  }, [map, positions]);
  return null;
}

export default function RouteMap({ route, interactive = false }) {
  if (!route || route.length === 0) {
    return <div className="activity-card-map no-route">No GPS route</div>;
  }

  return (
    <div className="activity-card-map">
      <MapContainer
        center={route[0]}
        zoom={13}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={false}
        className="route-map-container"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Polyline positions={route} pathOptions={{ color: "var(--series-1)", weight: 3 }} />
        <FitBounds positions={route} />
      </MapContainer>
    </div>
  );
}
