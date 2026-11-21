import { useEffect, useState, type ComponentProps } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation, PackageCheck, Truck } from 'lucide-react';
import type { Order } from '../types.ts';

interface OrderTrackingMapProps {
  order: Order;
}

interface LatLngPoint {
  lat: number;
  lng: number;
}

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

function RoutePolylineOverlay({
  origin,
  courier,
  destination,
}: {
  origin: LatLngPoint;
  courier: LatLngPoint;
  destination: LatLngPoint;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;

    const completedLine = new mapsLib.Polyline({
      path: [origin, courier],
      strokeColor: '#2563EB',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      map,
    });

    const remainingLine = new mapsLib.Polyline({
      path: [courier, destination],
      strokeColor: '#71717A',
      strokeOpacity: 0.6,
      strokeWeight: 3,
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, scale: 3 },
          offset: '0',
          repeat: '14px',
        },
      ],
      map,
    });

    return () => {
      completedLine.setMap(null);
      remainingLine.setMap(null);
    };
  }, [map, mapsLib, origin, courier, destination]);

  return null;
}

type MarkerAnchor = ComponentProps<typeof InfoWindow>['anchor'];

function InteractiveMapContent({ order }: { order: Order }) {
  const status = useApiLoadingStatus();
  const [selectedPin, setSelectedPin] = useState<'origin' | 'courier' | 'dest' | null>(null);
  const [originMarkerRef, setOriginMarker] = useState<MarkerAnchor>(null);
  const [courierMarkerRef, setCourierMarker] = useState<MarkerAnchor>(null);
  const [destMarkerRef, setDestMarker] = useState<MarkerAnchor>(null);

  const originPos = { lat: order.originLat, lng: order.originLng };
  const courierPos = { lat: order.courierLat, lng: order.courierLng };
  const destPos = { lat: order.destLat, lng: order.destLng };

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="h-[340px] w-full rounded-xl border border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <Navigation className="w-8 h-8 text-zinc-400 mb-3" />
        <p className="text-sm font-medium text-zinc-900">
          Peta interaktif sementara tidak dapat dimuat
        </p>
        <p className="text-xs text-zinc-500 mt-1 max-w-md">
          Koordinat kurir saat ini: <span className="font-mono tabular-nums">{order.courierLat}, {order.courierLng}</span> ({order.currentLocationLabel})
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[340px] w-full rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={courierPos}
        center={courierPos}
        defaultZoom={11}
        gestureHandling="greedy"
        disableDefaultUI={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        <RoutePolylineOverlay
          origin={originPos}
          courier={courierPos}
          destination={destPos}
        />

        <AdvancedMarker
          ref={setOriginMarker}
          position={originPos}
          onClick={() => setSelectedPin('origin')}
          title="Gudang elchapo.clg"
        >
          <Pin background="#111113" borderColor="#111113" glyphColor="#FFFFFF" />
        </AdvancedMarker>

        <AdvancedMarker
          ref={setCourierMarker}
          position={courierPos}
          onClick={() => setSelectedPin('courier')}
          title="Posisi Kurir Saat Ini"
        >
          <div className="w-9 h-9 rounded-full bg-[#2563EB] text-white border-2 border-white shadow-md flex items-center justify-center">
            <Truck className="w-4 h-4" />
          </div>
        </AdvancedMarker>

        <AdvancedMarker
          ref={setDestMarker}
          position={destPos}
          onClick={() => setSelectedPin('dest')}
          title="Alamat Penerima"
        >
          <Pin background="#16A34A" borderColor="#14532D" glyphColor="#FFFFFF" />
        </AdvancedMarker>

        {selectedPin === 'origin' && originMarkerRef && (
          <InfoWindow anchor={originMarkerRef} onCloseClick={() => setSelectedPin(null)}>
            <div className="p-1 text-xs text-zinc-900">
              <p className="font-semibold">Warehouse elchapo.clg</p>
              <p className="text-zinc-500 mt-0.5">Titik keberangkatan pengiriman</p>
            </div>
          </InfoWindow>
        )}

        {selectedPin === 'courier' && courierMarkerRef && (
          <InfoWindow anchor={courierMarkerRef} onCloseClick={() => setSelectedPin(null)}>
            <div className="p-1 text-xs text-zinc-900">
              <p className="font-semibold">Lokasi Kurir Live</p>
              <p className="text-zinc-600 mt-0.5">{order.currentLocationLabel}</p>
              <p className="text-[11px] font-mono text-zinc-400 mt-1 tabular-nums">
                {order.courierLat.toFixed(4)}, {order.courierLng.toFixed(4)}
              </p>
            </div>
          </InfoWindow>
        )}

        {selectedPin === 'dest' && destMarkerRef && (
          <InfoWindow anchor={destMarkerRef} onCloseClick={() => setSelectedPin(null)}>
            <div className="p-1 text-xs text-zinc-900 max-w-[200px]">
              <p className="font-semibold">Tujuan: {order.recipientName}</p>
              <p className="text-zinc-500 mt-0.5">{order.shippingAddress}</p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}

export function OrderTrackingMap({ order }: OrderTrackingMapProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-zinc-900" />
            <span>Asal: Warehouse</span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#2563EB]">
            <Truck className="w-3.5 h-3.5" />
            <span>Kurir Live: {order.currentLocationLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Tujuan Penerima</span>
          </span>
        </div>
        <span className="font-mono tabular-nums text-[11px] text-zinc-500">
          {order.courierLat.toFixed(4)}, {order.courierLng.toFixed(4)}
        </span>
      </div>

      {MAPS_API_KEY ? (
        <APIProvider apiKey={MAPS_API_KEY} language="id" region="ID" libraries={['marker', 'maps']}>
          <InteractiveMapContent order={order} />
        </APIProvider>
      ) : (
        <div className="h-[340px] w-full rounded-xl border border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
          <Navigation className="w-8 h-8 text-zinc-400 mb-3" />
          <p className="text-sm font-medium text-zinc-900">
            Peta Pelacakan Lokasi Pengiriman
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-md">
            Lokasi kurir saat ini: {order.currentLocationLabel} ({order.courierLat.toFixed(4)}, {order.courierLng.toFixed(4)})
          </p>
        </div>
      )}
    </div>
  );
}
