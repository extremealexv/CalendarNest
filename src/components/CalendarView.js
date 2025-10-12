import React, { useState } from 'react';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import EventModal from './EventModal';
import './CalendarView.css';

const CalendarView = ({ 
  view, 
  events, 
  selectedDate, 
  onDateChange, 
  onEventCreate, 
  accounts 
}) => {
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);

  const handleTimeSlotClick = (date, time) => {
    setSelectedTimeSlot({ date, time });
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (event) => {
    setEditingEvent(event);
    setSelectedTimeSlot(null);
    setShowEventModal(true);
  };

  const handleEventCreate = async (eventData) => {
    try {
      await onEventCreate(eventData);
      setShowEventModal(false);
      setSelectedTimeSlot(null);
      setEditingEvent(null);
    } catch (error) {
      console.error('Failed to create event:', error);
      // Error handling will be done in the modal
      throw error;
    }
  };

  const handleModalClose = () => {
    setShowEventModal(false);
    setSelectedTimeSlot(null);
    setEditingEvent(null);
  };

  const renderCalendarView = () => {
    const commonProps = {
      events,
      selectedDate,
      onDateChange,
      onTimeSlotClick: handleTimeSlotClick,
      onEventClick: handleEventClick,
      accounts
    };

    switch (view) {
      case 'day':
        return <DayView {...commonProps} />;
      case 'week':
        return <WeekView {...commonProps} />;
      case 'month':
      default:
        return <MonthView {...commonProps} />;
    }
  };

  return (
    <div className="calendar-view">
      <div className="calendar-content">
        {renderCalendarView()}
      </div>

      {showEventModal && (
        <EventModal
          isOpen={showEventModal}
          onClose={handleModalClose}
          onEventCreate={handleEventCreate}
          selectedTimeSlot={selectedTimeSlot}
          editingEvent={editingEvent}
          accounts={accounts}
        />
      )}
    </div>
  );
};

export default CalendarView;