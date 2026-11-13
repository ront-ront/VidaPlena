export const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const row = (n: number, status = 'confirmed') => ({
  id: id(n),
  patientId: id(n + 10),
  professionalId: id(n + 20),
  specialtyId: id(50),
  roomId: id(60),
  roomName: 'Sala Ipê',
  professionalName: `Profissional ${n}`,
  specialtyName: 'Cardiologia',
  modality: 'onsite',
  visitType: 'first',
  startsAt: `2030-05-12T${11 + n}:00:00.000Z`,
  endsAt: `2030-05-12T${12 + n}:00:00.000Z`,
  durationMinutes: 60,
  version: 1,
  status,
  bookingSource: n === 2 ? 'imported' : 'reception',
  attendanceResponse: null,
  patient: {
    id: id(n + 10),
    name: `Paciente Fictício ${n}`,
    birthDate: '1990-01-01',
    cpfMasked: '***.***.***-09',
    importOrigin: null,
  },
  professional: { id: id(n + 20), name: `Profissional ${n}` },
  specialty: { id: id(50), name: 'Cardiologia' },
  room: { id: id(60), name: 'Sala Ipê' },
  importOrigin:
    n === 2
      ? {
          sourceSystem: 'CSV demonstração',
          externalId: 'external-2',
          batchId: id(80),
          importedAt: '2030-01-01T12:00:00.000Z',
          importedBy: id(81),
          historicalStatus: 'before_cutoff',
        }
      : null,
  checkIn:
    n === 2
      ? {
          arrivedAt: '2030-05-12T13:16:00.000Z',
          recordedAt: '2030-05-12T13:16:00.000Z',
          lateFlag: true,
        }
      : null,
  administrativeFlags: n === 1 ? ['contact_missing', 'email_unverified'] : [],
  notificationAttention: n === 1,
  patientChangeDeadline: '2030-05-12T08:00:00.000Z',
  lastChange: null,
  noShowEligible: false,
  absence:
    status === 'no_show'
      ? {
          kind: 'unjustified',
          version: 1,
          recordedAt: '2030-05-12T15:00:00.000Z',
          decidedAt: '2030-05-12T15:00:00.000Z',
        }
      : null,
  evolution: 'CONTEÚDO CLÍNICO NÃO EXIBIR',
})
