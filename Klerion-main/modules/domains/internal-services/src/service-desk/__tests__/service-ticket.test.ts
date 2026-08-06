import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceTicket,
  InMemoryServiceTicketRepository,
  TicketService,
} from '../../index.js';

describe('SD-001 - SD-006: Service Desk Domain Engine & Application Service', () => {
  test('creates a valid ServiceTicket aggregate and enforces invariants', () => {
    const ticket = new ServiceTicket({
      id: 'tck_1',
      tenantId: 'tenant-alpha',
      title: 'Laptop display flickering',
      description: 'Screen goes black when moving hinge',
      category: 'IT_SUPPORT',
      priority: 'HIGH',
      requesterUserId: 'user-bob',
      requesterName: 'Bob Smith',
    });

    assert.equal(ticket.id, 'tck_1');
    assert.equal(ticket.tenantId, 'tenant-alpha');
    assert.equal(ticket.status, 'NEW');
    assert.equal(ticket.priority, 'HIGH');
    assert.equal(ticket.category, 'IT_SUPPORT');
    assert.equal(ticket.timeline.length, 1);
    assert.equal(ticket.slaStatus, 'MET');
    assert.ok(ticket.dueAt instanceof Date);
  });

  test('throws validation error if required fields are missing', () => {
    assert.throws(() => {
      new ServiceTicket({
        id: '',
        tenantId: 'tenant-1',
        title: 'Title',
        description: 'Desc',
        category: 'IT_SUPPORT',
        requesterUserId: 'user-1',
      });
    }, /ServiceTicket invariant failed: id is required/);

    assert.throws(() => {
      new ServiceTicket({
        id: 'tck_1',
        tenantId: '',
        title: 'Title',
        description: 'Desc',
        category: 'IT_SUPPORT',
        requesterUserId: 'user-1',
      });
    }, /ServiceTicket invariant failed: tenantId is required/);

    assert.throws(() => {
      new ServiceTicket({
        id: 'tck_1',
        tenantId: 'tenant-1',
        title: '',
        description: 'Desc',
        category: 'IT_SUPPORT',
        requesterUserId: 'user-1',
      });
    }, /ServiceTicket invariant failed: title is required/);
  });

  test('handles complete ticket lifecycle (submit, assign, update, comment, resolve, close)', async () => {
    const repo = new InMemoryServiceTicketRepository();
    const auditEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const service = new TicketService(repo, async (evt, payload) => {
      auditEvents.push({ event: evt, payload });
    });

    // Create draft
    const draft = await service.saveDraft('tenant-1', {
      title: 'Request new monitor',
      description: 'Dual 27 inch 4k monitors',
      category: 'IT_SUPPORT',
      requesterUserId: 'user-alice',
    });
    assert.equal(draft.status, 'DRAFT');

    // Submit draft
    const ticket = await service.submitDraft('tenant-1', draft.id, 'user-alice');
    assert.equal(ticket.status, 'NEW');

    // Assign ticket
    await service.assignTicket('tenant-1', ticket.id, 'agent-1', 'agent-1', 'it-team');
    assert.equal(ticket.status, 'OPEN');
    assert.equal(ticket.assignedUserId, 'agent-1');

    // Add public comment & internal note
    await service.addComment('tenant-1', ticket.id, 'agent-1', 'Ordered from vendor', true, 'Agent 1', 'Support Agent');
    await service.addComment('tenant-1', ticket.id, 'user-alice', 'Thanks for updating', false, 'Alice', 'Employee');
    assert.equal(ticket.comments.length, 2);

    // Update priority
    await service.updatePriority('tenant-1', ticket.id, 'agent-1', 'URGENT', 'User needs for client demo');
    assert.equal(ticket.priority, 'URGENT');

    // Resolve
    await service.resolveTicket('tenant-1', ticket.id, 'agent-1', 'Monitors delivered and setup at desk');
    assert.equal(ticket.status, 'RESOLVED');

    // Close
    await service.closeTicket('tenant-1', ticket.id, 'user-alice');
    assert.equal(ticket.status, 'CLOSED');

    assert.ok(auditEvents.some((e) => e.event === 'ticket.created' || e.event === 'ticket.draft_saved'));
    assert.ok(auditEvents.some((e) => e.event === 'ticket.resolved'));
  });

  test('enforces strict tenant isolation in repository', async () => {
    const repo = new InMemoryServiceTicketRepository();
    const service = new TicketService(repo);

    await service.createTicket('tenant-A', {
      title: 'Tenant A ticket',
      description: 'Secret A data',
      category: 'IT_SUPPORT',
      requesterUserId: 'user-A',
    });

    await service.createTicket('tenant-B', {
      title: 'Tenant B ticket',
      description: 'Secret B data',
      category: 'HR_REQUEST',
      requesterUserId: 'user-B',
    });

    const tenantATickets = await service.listTickets('tenant-A');
    assert.equal(tenantATickets.total, 1);
    assert.equal(tenantATickets.items[0].title, 'Tenant A ticket');

    const tenantBTickets = await service.listTickets('tenant-B');
    assert.equal(tenantBTickets.total, 1);
    assert.equal(tenantBTickets.items[0].title, 'Tenant B ticket');

    // Direct lookup by ID across tenants returns null
    const crossLookup = await repo.findById('tenant-A', tenantBTickets.items[0].id);
    assert.equal(crossLookup, null);
  });
});
