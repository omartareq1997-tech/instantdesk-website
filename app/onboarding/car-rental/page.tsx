'use client'

import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, Edit3, Plus, Trash2, UploadCloud, X } from 'lucide-react'

type CarDraft = {
  id: string
  car_name: string
  make: string
  model: string
  class_name: string
  transmission: string
  seats: string
  fuel_type: string
  daily_price: string
  deposit: string
  license_plate: string
  location: string
  status: string
}

type LocationDraft = {
  id: string
  locationType: 'pickup' | 'dropoff' | 'both'
  name: string
  address: string
  googleMapsLink: string
  latitude: string
  longitude: string
  terminalInstructions: string
  pickupInstructionText: string
  dropoffInstructionText: string
  active: boolean
}

type CsvRow = CarDraft & { rowNumber: number; errors: string[] }

const steps = ['Company details', 'Rental settings', 'Fleet setup', 'Pickup & drop-off locations', 'Finish']
const requiredCsvColumns = ['car_name', 'make', 'model', 'class_name', 'transmission', 'seats', 'fuel_type', 'daily_price', 'deposit', 'license_plate', 'location', 'status']
const makes = ['Toyota', 'Hyundai', 'Kia', 'Honda', 'Nissan', 'Volkswagen', 'Skoda', 'Mercedes', 'BMW', 'Audi', 'Ford', 'Renault', 'Peugeot', 'Opel', 'Fiat', 'Tesla']
const modelsByMake: Record<string, string[]> = {
  Toyota: ['Corolla', 'Yaris', 'Camry', 'RAV4', 'Prius', 'CHR', 'Land Cruiser', 'Proace'],
  Hyundai: ['i10', 'i20', 'i30', 'Elantra', 'Tucson', 'Santa Fe', 'Kona'],
  Kia: ['Picanto', 'Rio', 'Ceed', 'Sportage', 'Sorento', 'Stonic'],
  Honda: ['Jazz', 'Civic', 'Accord', 'HR-V', 'CR-V'],
  Nissan: ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Leaf'],
  Volkswagen: ['Polo', 'Golf', 'Passat', 'T-Roc', 'Tiguan', 'Transporter'],
  Skoda: ['Fabia', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq'],
  Mercedes: ['A-Class', 'C-Class', 'E-Class', 'GLC', 'Vito', 'Sprinter'],
  BMW: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'],
  Audi: ['A1', 'A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  Ford: ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'Transit'],
  Renault: ['Clio', 'Megane', 'Captur', 'Kadjar', 'Trafic'],
  Peugeot: ['208', '308', '3008', '5008', 'Partner'],
  Opel: ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Vivaro'],
  Fiat: ['500', 'Panda', 'Tipo', 'Doblo', 'Ducato'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X'],
}
const classes = ['Economy', 'Compact', 'Sedan', 'SUV', 'Luxury', 'Van', 'Truck']
const transmissions = ['Automatic', 'Manual']
const fuelTypes = ['Petrol', 'Diesel', 'LPG', 'Hybrid', 'Plug-in Hybrid', 'Electric']
const statuses = ['Available', 'Reserved', 'Rented', 'Cleaning', 'Maintenance', 'Out of service']

function uid() {
  return crypto.randomUUID()
}

function emptyCar(locations: LocationDraft[] = []): CarDraft {
  return {
    id: uid(),
    car_name: '',
    make: 'Toyota',
    model: 'Corolla',
    class_name: 'Economy',
    transmission: 'Automatic',
    seats: '5',
    fuel_type: 'Petrol',
    daily_price: '',
    deposit: '',
    license_plate: '',
    location: locations[0]?.name ?? '',
    status: 'Available',
  }
}

function emptyLocation(type: LocationDraft['locationType'] = 'both'): LocationDraft {
  return {
    id: uid(),
    locationType: type,
    name: '',
    address: '',
    googleMapsLink: '',
    latitude: '',
    longitude: '',
    terminalInstructions: '',
    pickupInstructionText: '',
    dropoffInstructionText: '',
    active: true,
  }
}

function demoCars(): CarDraft[] {
  return [
    { ...emptyCar(), id: uid(), car_name: 'Toyota Yaris', make: 'Toyota', model: 'Yaris', class_name: 'Economy', transmission: 'Automatic', seats: '5', fuel_type: 'Hybrid', daily_price: '140', deposit: '800', license_plate: 'KR 2458A', location: 'Airport Terminal 1', status: 'Available' },
    { ...emptyCar(), id: uid(), car_name: 'Hyundai i20', make: 'Hyundai', model: 'i20', class_name: 'Economy', transmission: 'Manual', seats: '5', fuel_type: 'Petrol', daily_price: '125', deposit: '700', license_plate: 'KR 8821G', location: 'City Office', status: 'Available' },
    { ...emptyCar(), id: uid(), car_name: 'Kia Sportage', make: 'Kia', model: 'Sportage', class_name: 'SUV', transmission: 'Automatic', seats: '5', fuel_type: 'Petrol', daily_price: '260', deposit: '1500', license_plate: 'KR 5512S', location: 'Airport Terminal 1', status: 'Available' },
    { ...emptyCar(), id: uid(), car_name: 'Mercedes Vito', make: 'Mercedes', model: 'Vito', class_name: 'Van', transmission: 'Automatic', seats: '8', fuel_type: 'Diesel', daily_price: '390', deposit: '2200', license_plate: 'KR 9001V', location: 'Main Parking Lot', status: 'Available' },
  ]
}

function demoLocations(): LocationDraft[] {
  return [
    { ...emptyLocation('both'), id: uid(), name: 'Airport Terminal 1', address: 'Arrivals hall, Terminal 1', googleMapsLink: 'https://maps.google.com/?q=Airport+Terminal+1', terminalInstructions: 'Meet at arrivals exit 2. Parking zone P2, row B.', pickupInstructionText: 'Pickup at Terminal 1 arrivals, exit 2. Parking P2 row B.', dropoffInstructionText: 'Drop off at Terminal 1 short-term parking P2, row B.' },
    { ...emptyLocation('both'), id: uid(), name: 'Airport Terminal 2', address: 'Arrivals hall, Terminal 2', googleMapsLink: 'https://maps.google.com/?q=Airport+Terminal+2', terminalInstructions: 'Meet near the information desk.', pickupInstructionText: 'Pickup at Terminal 2 information desk.', dropoffInstructionText: 'Drop off at Terminal 2 departures curb.' },
    { ...emptyLocation('both'), id: uid(), name: 'City Office', address: 'Main office, city center', googleMapsLink: 'https://maps.google.com', pickupInstructionText: 'Enter the office and ask for the rental desk.', dropoffInstructionText: 'Park in front of the office and return keys at reception.' },
    { ...emptyLocation('pickup'), id: uid(), name: 'Hotel Delivery', address: 'Customer hotel delivery', googleMapsLink: 'https://maps.google.com', pickupInstructionText: 'Driver meets the customer at the hotel lobby.' },
    { ...emptyLocation('dropoff'), id: uid(), name: 'Main Parking Lot', address: 'Fleet parking lot', googleMapsLink: 'https://maps.google.com/?q=Main+Parking+Lot', dropoffInstructionText: 'Park in any marked return bay and send a photo by WhatsApp.' },
  ]
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let current = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(current.trim())
      current = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(current.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      current = ''
    } else {
      current += char
    }
  }
  row.push(current.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function validateCsv(text: string): { rows: CsvRow[]; missingColumns: string[] } {
  const parsed = parseCsv(text)
  const headers = (parsed[0] ?? []).map(header => header.trim().toLowerCase())
  const missingColumns = requiredCsvColumns.filter(column => !headers.includes(column))
  if (missingColumns.length) return { rows: [], missingColumns }

  const rows = parsed.slice(1).map((values, index) => {
    const record = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']))
    const car: CsvRow = {
      ...emptyCar(),
      id: uid(),
      rowNumber: index + 2,
      errors: [],
      car_name: record.car_name,
      make: record.make,
      model: record.model,
      class_name: record.class_name,
      transmission: record.transmission,
      seats: record.seats,
      fuel_type: record.fuel_type,
      daily_price: record.daily_price,
      deposit: record.deposit,
      license_plate: record.license_plate,
      location: record.location,
      status: record.status,
    }
    for (const column of requiredCsvColumns) {
      if (!record[column]?.trim()) car.errors.push(`${column} is required`)
    }
    if (Number.isNaN(Number(car.seats)) || Number(car.seats) <= 0) car.errors.push('seats must be a positive number')
    if (Number.isNaN(Number(car.daily_price))) car.errors.push('daily_price must be numeric')
    if (Number.isNaN(Number(car.deposit))) car.errors.push('deposit must be numeric')
    return car
  })
  return { rows, missingColumns: [] }
}

export default function CarRentalOnboardingPage() {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvMissing, setCsvMissing] = useState<string[]>([])
  const [csvLoading, setCsvLoading] = useState(false)
  const [skipFleet, setSkipFleet] = useState(false)
  const [skipLocations, setSkipLocations] = useState(false)
  const [company, setCompany] = useState({ name: '', phone: '', whatsapp: '', email: '', website: '' })
  const [settings, setSettings] = useState({ currency: 'PLN', bufferMinutes: '120', depositPolicy: '', minimumDuration: '1 day', pickupRules: '' })
  const [cars, setCars] = useState<CarDraft[]>([])
  const [carForm, setCarForm] = useState<CarDraft>(() => emptyCar())
  const [editingCarId, setEditingCarId] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationDraft[]>([])
  const [locationForm, setLocationForm] = useState<LocationDraft>(() => emptyLocation('both'))
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step])
  const locationNames = locations.filter(location => location.active).map(location => location.name).filter(Boolean)
  const canImportCsv = csvRows.length > 0 && csvRows.every(row => row.errors.length === 0)

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 2600)
  }

  function setMake(make: string) {
    const firstModel = modelsByMake[make]?.[0] ?? ''
    setCarForm(prev => ({ ...prev, make, model: firstModel, car_name: `${make} ${firstModel}`.trim() }))
  }

  function setModel(model: string) {
    setCarForm(prev => ({ ...prev, model, car_name: `${prev.make} ${model}`.trim() }))
  }

  function saveCar() {
    if (!carForm.car_name.trim() || !carForm.license_plate.trim()) {
      showToast('Car name and license plate are required.')
      return
    }
    setCars(prev => editingCarId ? prev.map(car => car.id === editingCarId ? { ...carForm, id: editingCarId } : car) : [...prev, { ...carForm, id: uid() }])
    setCarForm(emptyCar(locations))
    setEditingCarId(null)
    setSkipFleet(false)
    showToast(editingCarId ? 'Car updated.' : 'Car added.')
  }

  function editCar(car: CarDraft) {
    setCarForm(car)
    setEditingCarId(car.id)
  }

  async function readCsv(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('Please upload a .csv file.')
      return
    }
    setCsvLoading(true)
    try {
      const result = validateCsv(await file.text())
      setCsvRows(result.rows)
      setCsvMissing(result.missingColumns)
      showToast(result.missingColumns.length ? 'CSV has missing required columns.' : `Preview loaded: ${result.rows.length} rows.`)
    } finally {
      setCsvLoading(false)
      setDragging(false)
    }
  }

  function importCsvRows() {
    if (!canImportCsv) return
    setCars(prev => [...prev, ...csvRows.map(({ rowNumber, errors, ...row }) => ({ ...row, id: uid() }))])
    setCsvRows([])
    setCsvMissing([])
    setSkipFleet(false)
    showToast(`Imported ${csvRows.length} cars.`)
  }

  function downloadTemplate() {
    const csv = `${requiredCsvColumns.join(',')}\nToyota Yaris,Toyota,Yaris,Economy,Automatic,5,Hybrid,140,800,KR 2458A,Airport Terminal 1,Available\n`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'instantdesk-car-rental-fleet-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function useDemoFleet() {
    const demoLocationsList = locations.length ? locations : demoLocations()
    setLocations(demoLocationsList)
    setCars(demoCars())
    setSkipFleet(false)
    setSkipLocations(false)
    showToast('Demo fleet and locations added.')
  }

  function saveLocation() {
    if (!locationForm.name.trim()) {
      showToast('Location name is required.')
      return
    }
    setLocations(prev => editingLocationId ? prev.map(location => location.id === editingLocationId ? { ...locationForm, id: editingLocationId } : location) : [...prev, { ...locationForm, id: uid() }])
    setLocationForm(emptyLocation('both'))
    setEditingLocationId(null)
    setSkipLocations(false)
    showToast(editingLocationId ? 'Location updated.' : 'Location added.')
  }

  function setLocationType(type: LocationDraft['locationType']) {
    setLocationForm(prev => ({ ...prev, locationType: type }))
  }

  function finishAllowed() {
    if (!skipFleet && cars.length === 0) return 'Add at least one fleet car or choose skip fleet setup.'
    if (!skipLocations && locations.length === 0) return 'Add at least one pickup/drop-off location or choose skip locations.'
    return null
  }

  async function finish() {
    const blocker = finishAllowed()
    if (blocker) {
      showToast(blocker)
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/rental/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          settings,
          cars,
          locations,
          useDemoFleet: false,
          useDemoLocations: false,
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string; importedCars?: number; importedLocations?: number }
      if (!response.ok) {
        showToast(data.error ?? 'Could not save onboarding.')
        return
      }
      await fetch('/api/business/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType: 'car_rental' }),
      }).catch(() => {})
      localStorage.setItem('instantdesk_business_type', 'car_rental')
      localStorage.setItem('instantdesk_car_rental_onboarding_done', 'true')
      showToast(`Saved ${data.importedCars ?? cars.length} cars and ${data.importedLocations ?? locations.length} locations.`)
      window.location.href = '/dashboard#rental_ops'
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="auth-premium-bg min-h-screen px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <img src="/assets/instantdesk-logo.png" alt="InstantDesk" className="h-8 w-auto" />
          <a href="/dashboard#settings" className="text-sm font-medium text-white/52 transition-colors hover:text-white">Back to settings</a>
        </header>

        {toast && (
          <div className="fixed right-5 top-5 z-50 rounded-full border border-orange-300/25 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl">
            {toast}
          </div>
        )}

        <section className="grid flex-1 gap-10 py-12 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/80">Car Rental Setup</p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight md:text-5xl">Configure real rental operations.</h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/52">Upload fleet data, add vehicles manually, define pickup and drop-off instructions, then save everything to InstantDesk.</p>
            <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-gradient-to-r from-[#f46f67] to-[#f8a36d] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-5 space-y-2">
              {steps.map((label, index) => (
                <button key={label} onClick={() => setStep(index)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${index === step ? 'bg-white/8 text-white' : 'text-white/38 hover:bg-white/[0.04] hover:text-white/70'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${index < step ? 'bg-orange-300 text-black' : 'bg-white/8 text-white/60'}`}>
                    {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </aside>

          <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl">
            {step === 0 && (
              <Panel title="Company details" subtitle="Used in confirmations, PDFs, and handover notes.">
                <Grid>
                  <Field label="Rental company name" value={company.name} onChange={value => setCompany(prev => ({ ...prev, name: value }))} />
                  <Field label="Phone" value={company.phone} onChange={value => setCompany(prev => ({ ...prev, phone: value }))} />
                  <Field label="WhatsApp" value={company.whatsapp} onChange={value => setCompany(prev => ({ ...prev, whatsapp: value }))} />
                  <Field label="Email" value={company.email} onChange={value => setCompany(prev => ({ ...prev, email: value }))} />
                  <Field label="Website" value={company.website} onChange={value => setCompany(prev => ({ ...prev, website: value }))} />
                </Grid>
              </Panel>
            )}

            {step === 1 && (
              <Panel title="Rental settings" subtitle="Availability checks and booking confirmations use these rules.">
                <Grid>
                  <Select label="Default currency" value={settings.currency} onChange={value => setSettings(prev => ({ ...prev, currency: value }))} options={['PLN', 'EUR', 'USD', 'GBP']} />
                  <Field label="Cleaning/turnaround buffer minutes" type="number" value={settings.bufferMinutes} onChange={value => setSettings(prev => ({ ...prev, bufferMinutes: value }))} />
                  <Field label="Minimum rental duration" value={settings.minimumDuration} onChange={value => setSettings(prev => ({ ...prev, minimumDuration: value }))} />
                </Grid>
                <Field label="Deposit policy" value={settings.depositPolicy} onChange={value => setSettings(prev => ({ ...prev, depositPolicy: value }))} textarea />
                <Field label="Pickup/drop-off rules" value={settings.pickupRules} onChange={value => setSettings(prev => ({ ...prev, pickupRules: value }))} textarea />
              </Panel>
            )}

            {step === 2 && (
              <Panel title="Fleet setup" subtitle="Import a CSV, use demo data, or add cars manually.">
                <div className="flex flex-wrap gap-3">
                  <button onClick={downloadTemplate} className="btn-muted"><Download className="h-4 w-4" />Download CSV template</button>
                  <button onClick={useDemoFleet} className="btn-muted"><Check className="h-4 w-4" />Use demo fleet data</button>
                  <label className="flex items-center gap-2 text-sm text-white/54">
                    <input type="checkbox" checked={skipFleet} onChange={event => setSkipFleet(event.target.checked)} />
                    Skip fleet setup for now
                  </label>
                </div>

                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void readCsv(file) }} />
                <div
                  onDragOver={event => { event.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void readCsv(file) }}
                  className={`mt-5 rounded-2xl border border-dashed p-8 text-center transition-colors ${dragging ? 'border-orange-300/70 bg-orange-300/10' : 'border-white/14 bg-white/[0.03]'}`}
                >
                  <UploadCloud className="mx-auto h-8 w-8 text-orange-300/70" />
                  <p className="mt-3 text-sm font-semibold">Drop CSV here or choose a file</p>
                  <p className="mt-1 text-xs leading-5 text-white/42">Required columns: {requiredCsvColumns.join(', ')}</p>
                  <button onClick={() => fileRef.current?.click()} className="mt-4 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-orange-100">
                    {csvLoading ? 'Reading...' : 'Upload CSV'}
                  </button>
                </div>

                {(csvMissing.length > 0 || csvRows.length > 0) && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    {csvMissing.length > 0 ? (
                      <p className="text-sm font-semibold text-red-300">Missing columns: {csvMissing.join(', ')}</p>
                    ) : (
                      <>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">CSV preview · {csvRows.length} rows</p>
                          <button disabled={!canImportCsv} onClick={importCsvRows} className="btn-primary disabled:opacity-40">Import fleet</button>
                        </div>
                        <PreviewTable rows={csvRows} />
                      </>
                    )}
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <h3 className="text-sm font-semibold">Add car manually</h3>
                  <Grid className="mt-4">
                    <Select label="Make" value={carForm.make} onChange={setMake} options={makes} />
                    <Select label="Model" value={carForm.model} onChange={setModel} options={modelsByMake[carForm.make] ?? []} />
                    <Field label="Car name/model" value={carForm.car_name} onChange={value => setCarForm(prev => ({ ...prev, car_name: value }))} />
                    <Select label="Class" value={carForm.class_name} onChange={value => setCarForm(prev => ({ ...prev, class_name: value }))} options={classes} />
                    <Select label="Transmission" value={carForm.transmission} onChange={value => setCarForm(prev => ({ ...prev, transmission: value }))} options={transmissions} />
                    <Select label="Fuel type" value={carForm.fuel_type} onChange={value => setCarForm(prev => ({ ...prev, fuel_type: value }))} options={fuelTypes} />
                    <Field label="Seats" type="number" value={carForm.seats} onChange={value => setCarForm(prev => ({ ...prev, seats: value }))} />
                    <MoneyField label="Daily price" currency={settings.currency} value={carForm.daily_price} onChange={value => setCarForm(prev => ({ ...prev, daily_price: value }))} />
                    <MoneyField label="Deposit" currency={settings.currency} value={carForm.deposit} onChange={value => setCarForm(prev => ({ ...prev, deposit: value }))} />
                    <Field label="License plate" value={carForm.license_plate} onChange={value => setCarForm(prev => ({ ...prev, license_plate: value }))} />
                    <Select label="Location" value={carForm.location} onChange={value => setCarForm(prev => ({ ...prev, location: value }))} options={locationNames.length ? locationNames : ['Add locations in next step']} disabled={!locationNames.length} />
                    <Select label="Status" value={carForm.status} onChange={value => setCarForm(prev => ({ ...prev, status: value }))} options={statuses} />
                  </Grid>
                  <button onClick={saveCar} className="btn-primary mt-5"><Plus className="h-4 w-4" />{editingCarId ? 'Update car' : 'Add car'}</button>
                </div>

                <CarsTable cars={cars} onEdit={editCar} onDelete={id => setCars(prev => prev.filter(car => car.id !== id))} />
              </Panel>
            )}

            {step === 3 && (
              <Panel title="Pickup and drop-off locations" subtitle="Create reusable instructions the bot can send during pickup and return conversations.">
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => setLocationType('pickup')} className="btn-muted">Add pickup location</button>
                  <button onClick={() => setLocationType('dropoff')} className="btn-muted">Add drop-off location</button>
                  <button onClick={() => setLocationType('both')} className="btn-muted">Add location usable for both</button>
                  <button onClick={() => setLocationForm(prev => ({ ...prev, dropoffInstructionText: prev.pickupInstructionText }))} className="btn-muted">Use same pickup details for drop-off</button>
                  <label className="flex items-center gap-2 text-sm text-white/54">
                    <input type="checkbox" checked={skipLocations} onChange={event => setSkipLocations(event.target.checked)} />
                    Skip locations for now
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <Grid>
                    <Select label="Location type" value={locationForm.locationType} onChange={value => setLocationForm(prev => ({ ...prev, locationType: value as LocationDraft['locationType'] }))} options={['pickup', 'dropoff', 'both']} />
                    <Field label="Location name" value={locationForm.name} onChange={value => setLocationForm(prev => ({ ...prev, name: value }))} />
                    <Field label="Address" value={locationForm.address} onChange={value => setLocationForm(prev => ({ ...prev, address: value }))} />
                    <Field label="Google Maps link" value={locationForm.googleMapsLink} onChange={value => setLocationForm(prev => ({ ...prev, googleMapsLink: value }))} />
                    <Field label="Latitude optional" value={locationForm.latitude} onChange={value => setLocationForm(prev => ({ ...prev, latitude: value }))} />
                    <Field label="Longitude optional" value={locationForm.longitude} onChange={value => setLocationForm(prev => ({ ...prev, longitude: value }))} />
                  </Grid>
                  <Field label="Airport terminal instructions" value={locationForm.terminalInstructions} onChange={value => setLocationForm(prev => ({ ...prev, terminalInstructions: value }))} textarea />
                  <Field label="Pickup instruction text" value={locationForm.pickupInstructionText} onChange={value => setLocationForm(prev => ({ ...prev, pickupInstructionText: value }))} textarea />
                  <Field label="Drop-off instruction text" value={locationForm.dropoffInstructionText} onChange={value => setLocationForm(prev => ({ ...prev, dropoffInstructionText: value }))} textarea />
                  <label className="mt-3 flex items-center gap-2 text-sm text-white/54">
                    <input type="checkbox" checked={locationForm.active} onChange={event => setLocationForm(prev => ({ ...prev, active: event.target.checked }))} />
                    Active
                  </label>
                  <button onClick={saveLocation} className="btn-primary mt-5"><Plus className="h-4 w-4" />{editingLocationId ? 'Update location' : 'Add location'}</button>
                </div>
                <LocationsTable locations={locations} onEdit={location => { setLocationForm(location); setEditingLocationId(location.id) }} onDelete={id => setLocations(prev => prev.filter(location => location.id !== id))} />
              </Panel>
            )}

            {step === 4 && (
              <Panel title="Finish setup" subtitle="Save rental settings, fleet cars, and locations to Supabase.">
                <div className="grid gap-3 text-sm text-white/58">
                  <Summary label="Fleet cars" value={skipFleet ? 'Skipped' : String(cars.length)} />
                  <Summary label="Locations" value={skipLocations ? 'Skipped' : String(locations.length)} />
                  <Summary label="Currency" value={settings.currency} />
                  <Summary label="Turnaround buffer" value={`${settings.bufferMinutes || '120'} minutes`} />
                </div>
                {finishAllowed() && <p className="rounded-2xl border border-orange-300/20 bg-orange-300/8 p-4 text-sm text-orange-100/80">{finishAllowed()}</p>}
              </Panel>
            )}

            <div className="mt-7 flex items-center justify-between">
              <button onClick={() => setStep(prev => Math.max(0, prev - 1))} disabled={step === 0} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-white/56 transition-colors hover:bg-white/8 hover:text-white disabled:pointer-events-none disabled:opacity-30">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              {step < steps.length - 1 ? (
                <button onClick={() => setStep(prev => Math.min(steps.length - 1, prev + 1))} className="btn-primary">Continue <ArrowRight className="h-4 w-4" /></button>
              ) : (
                <button onClick={() => void finish()} disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving...' : 'Save and open dashboard'} <ArrowRight className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/44">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-4 md:grid-cols-2 ${className}`}>{children}</div>
}

function Field({ label, value, onChange, textarea = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; type?: string }) {
  const className = 'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/24 focus:border-orange-300/50'
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-white/48">{label}</span>
      {textarea ? <textarea value={value} onChange={event => onChange(event.target.value)} rows={3} className={className} /> : <input type={type} value={value} onChange={event => onChange(event.target.value)} className={className} />}
    </label>
  )
}

function MoneyField({ label, currency, value, onChange }: { label: string; currency: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-white/48">{label}</span>
      <div className="flex rounded-2xl border border-white/10 bg-white/[0.04] focus-within:border-orange-300/50">
        <input type="number" value={value} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none" />
        <span className="border-l border-white/10 px-4 py-3 text-sm font-semibold text-white/42">{currency}</span>
      </div>
    </label>
  )
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-white/48">{label}</span>
      <select disabled={disabled} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-orange-300/50 disabled:opacity-50">
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function PreviewTable({ rows }: { rows: CsvRow[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-white/[0.04] text-white/44">
          <tr>{['Row', 'Car', 'Class', 'Transmission', 'Price', 'Location', 'Status', 'Errors'].map(header => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-t border-white/8">
              <td className="px-3 py-2 text-white/38">{row.rowNumber}</td>
              <td className="px-3 py-2">{row.car_name}</td>
              <td className="px-3 py-2">{row.class_name}</td>
              <td className="px-3 py-2">{row.transmission}</td>
              <td className="px-3 py-2">{row.daily_price}</td>
              <td className="px-3 py-2">{row.location}</td>
              <td className="px-3 py-2">{row.status}</td>
              <td className={`px-3 py-2 ${row.errors.length ? 'text-red-300' : 'text-emerald-300'}`}>{row.errors.length ? row.errors.join('; ') : 'OK'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CarsTable({ cars, onEdit, onDelete }: { cars: CarDraft[]; onEdit: (car: CarDraft) => void; onDelete: (id: string) => void }) {
  if (!cars.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/42">No fleet cars added yet.</p>
  return (
    <div className="mt-5 overflow-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[780px] text-left text-xs">
        <thead className="bg-white/[0.04] text-white/44"><tr>{['Car', 'Class', 'Transmission', 'Seats', 'Price', 'Location', 'Status', ''].map(header => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
        <tbody>{cars.map(car => (
          <tr key={car.id} className="border-t border-white/8">
            <td className="px-3 py-2 font-semibold">{car.car_name}</td><td className="px-3 py-2">{car.class_name}</td><td className="px-3 py-2">{car.transmission}</td><td className="px-3 py-2">{car.seats}</td><td className="px-3 py-2">{car.daily_price}</td><td className="px-3 py-2">{car.location || '-'}</td><td className="px-3 py-2">{car.status}</td>
            <td className="px-3 py-2"><div className="flex justify-end gap-2"><button onClick={() => onEdit(car)} className="icon-btn"><Edit3 className="h-3.5 w-3.5" /></button><button onClick={() => onDelete(car.id)} className="icon-btn"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function LocationsTable({ locations, onEdit, onDelete }: { locations: LocationDraft[]; onEdit: (location: LocationDraft) => void; onDelete: (id: string) => void }) {
  if (!locations.length) return <p className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/42">No pickup or drop-off locations added yet.</p>
  return (
    <div className="mt-5 grid gap-3">
      {locations.map(location => (
        <div key={location.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><span className="text-sm font-semibold">{location.name}</span><span className="rounded-full bg-orange-300/10 px-2 py-0.5 text-[10px] font-semibold text-orange-200">{location.locationType}</span>{!location.active && <span className="text-[10px] text-white/30">inactive</span>}</div>
              <p className="mt-1 text-xs text-white/42">{location.address || 'No address'} · {location.googleMapsLink || 'No map link'}</p>
              <p className="mt-2 text-xs leading-5 text-white/52">Pickup: {location.pickupInstructionText || '-'}</p>
              <p className="text-xs leading-5 text-white/52">Drop-off: {location.dropoffInstructionText || '-'}</p>
            </div>
            <div className="flex gap-2"><button onClick={() => onEdit(location)} className="icon-btn"><Edit3 className="h-3.5 w-3.5" /></button><button onClick={() => onDelete(location.id)} className="icon-btn"><X className="h-3.5 w-3.5" /></button></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"><span className="text-white/38">{label}</span><span className="font-semibold text-white">{value}</span></div>
}
