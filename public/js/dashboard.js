async function loadDashboard() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  const res = await fetch(`/reports/dashboard?startDate=${startDate}&endDate=${endDate}`);
  const data = await res.json();

  document.getElementById('totalFeedback').innerText = data.totalFeedback;
  document.getElementById('avgRating').innerText = data.avgRating.toFixed(2);
  document.getElementById('activeCustomers').innerText = data.activeCustomers;

  const ctx = document.getElementById('feedbackChart').getContext('2d');
  if (window.feedbackChart) window.feedbackChart.destroy();

  window.feedbackChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.regressionData.labels,
      datasets: [
        {
          label: 'Actual Rating',
          data: data.regressionData.values,
          borderColor: 'blue',
          fill: false
        },
        {
          label: 'Trend Projection',
          data: data.regressionData.projected,
          borderColor: 'red',
          borderDash: [5,5],
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } }
    }
  });
}

async function addORNumber() {
  const orNumber = document.getElementById('orNumber').value;
  if (!orNumber) return alert("Enter OR Number");

  const res = await fetch('/reports/add-or', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ orNumber })
  });

  const result = await res.json();
  if (res.ok) {
    alert(result.message);
    document.getElementById('orNumber').value = '';
    loadDashboard();
  } else {
    alert(result.error || "Error adding OR Number");
  }
}

window.onload = loadDashboard;
