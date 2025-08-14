import crypto from 'crypto';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const hasRazorpayCredentials = !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

if (!hasRazorpayCredentials) {
  console.warn('Razorpay credentials not configured, payment functionality disabled');
}

export async function createRazorpayOrder(amount: number, currency: string = 'INR') {
  if (!hasRazorpayCredentials) {
    console.log('Mock Razorpay order created for development');
    return {
      id: `order_dev_${Date.now()}`,
      amount,
      currency,
      status: 'created'
    };
  }
  
  try {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount, // Amount in paise
        currency: currency,
        receipt: `receipt_${Date.now()}`,
        notes: {
          purpose: 'AgentBrowse Premium Subscription',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Razorpay API error: ${response.statusText}`);
    }

    const order = await response.json();
    return order;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw new Error('Failed to create payment order');
  }
}

export function verifyRazorpayPayment(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (!hasRazorpayCredentials) {
    console.log('Mock Razorpay payment verification for development');
    return true; // Allow all payments in development
  }
  
  try {
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    return false;
  }
}

export async function getRazorpayPayment(paymentId: string) {
  if (!hasRazorpayCredentials) {
    console.log('Mock Razorpay payment details for development');
    return {
      id: paymentId,
      status: 'captured',
      amount: 2900,
      currency: 'INR'
    };
  }
  
  try {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Razorpay API error: ${response.statusText}`);
    }

    const payment = await response.json();
    return payment;
  } catch (error) {
    console.error('Error fetching Razorpay payment:', error);
    throw new Error('Failed to fetch payment details');
  }
}
