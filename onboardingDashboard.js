import { LightningElement, track, wire } from 'lwc';
import getOnboardingData from '@salesforce/apex/OnboardDashboardController.getOnboardingData';
import onboardEmployeesByIds from '@salesforce/apex/OnboardingService.onboardEmployeesByIds';
import triggerBackgroundCheck from '@salesforce/apex/BackgroundCheckService.triggerBackgroundCheck';
import markTaskCompleted from '@salesforce/apex/OnboardDashboardController.markTaskCompleted';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

export default class OnboardingDashboard extends LightningElement {
  @track employees = [];
  @track selectedEmployee = null;
  @track selectedEmployeeTasks = null;
  @track totalEmployees = 0;
  @track overallCompletion = 0;
  @track loading = false;
  wiredResult;

  taskColumns = [
    { label: 'Task', fieldName: 'Task_Title__c' },
    { label: 'Due Date', fieldName: 'DueDate__c', type: 'date' },
    { label: 'Status', fieldName: 'Status__c' },
    { type: 'action', typeAttributes: { rowActions: [{ label: 'Mark Completed', name: 'mark_completed' }] } }
  ];

  @wire(getOnboardingData)
  wiredEmployees(result) {
    this.wiredResult = result;
    const { data, error } = result;
    if (data) {
      this.employees = data.map(e => {
        const pct = e.completionPct ? Number(e.completionPct) : 0;
        const formatted = Math.round(pct * 100) / 100;
        return {
          ...e,
          completionPctFormatted: formatted,
          progressStyle: `width: ${formatted}%; height: 12px; background-color: #1589ee; border-radius: 4px;`
        };
      });

      // Calculate totals
      this.totalEmployees = this.employees.length;
      const totalPct = this.employees.reduce((sum, e) => sum + e.completionPctFormatted, 0);
      this.overallCompletion = this.totalEmployees ? Math.round(totalPct / this.totalEmployees) : 0;

      this.loading = false;
    } else if (error) {
      this.showToast('Error', error.body ? error.body.message : JSON.stringify(error), 'error');
      this.loading = false;
    }
  }

  handleBulkOnboard() {
    const ids = (this.employees || []).slice(0, 5).map(e => e.empId);
    if (!ids.length) {
      this.showToast('Info', 'No employees to onboard', 'info');
      return;
    }
    this.loading = true;
    onboardEmployeesByIds({ employeeIds: ids })
      .then(() => refreshApex(this.wiredResult))
      .then(() => this.showToast('Success', 'Bulk onboard started', 'success'))
      .catch(err => this.showToast('Error', err.body ? err.body.message : JSON.stringify(err), 'error'))
      .finally(() => (this.loading = false));
  }

  handleTriggerBgCheck(event) {
    const empId = event.target.dataset.id;
    const emp = this.employees.find(e => String(e.empId) === String(empId));
    this.selectedEmployee = emp;
    this.selectedEmployeeTasks = null;
    this.loading = true;
    triggerBackgroundCheck({ employeeId: empId })
      .then(() => refreshApex(this.wiredResult))
      .then(() => {
          this.showToast('Success', 'Background check triggered', 'success');
          this.selectedEmployee = this.employees.find(e => String(e.empId) === String(empId));
      })
      .catch(err => this.showToast('Error', err.body ? err.body.message : JSON.stringify(err), 'error'))
      .finally(() => (this.loading = false));
}


  handleShowTasks(event) {
    const empId = event.target.dataset.id;
    const emp = this.employees.find(e => String(e.empId) === String(empId));
    this.selectedEmployee = emp;
    this.selectedEmployeeTasks = emp.tasks || [];
  }

  handleRowAction(event) {
    const actionName = event.detail.action.name;
    const row = event.detail.row;
    if (actionName === 'mark_completed') {
      this.loading = true;
      markTaskCompleted({ taskId: row.Id })
        .then(() => refreshApex(this.wiredResult))
        .then(() => this.showToast('Success', 'Task marked completed', 'success'))
        .catch(err => this.showToast('Error', err.body ? err.body.message : JSON.stringify(err), 'error'))
        .finally(() => (this.loading = false));
    }
  }

  showToast(title, message, variant = 'info') {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
}
